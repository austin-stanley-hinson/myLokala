-- Merchant settlement: batching completed redemptions and executing Stripe
-- transfers against them. settlement_batches / settlement_items /
-- app_private.stripe_transfer_attempts already had schema (migration
-- 20260901000007) but no application code until now.
--
-- Design notes:
--   * Batching and transfer are two separate, manually-triggered steps (no
--     cron here -- a later, separate decision). Each is orchestrated from TS
--     as a loop over independent per-merchant / per-batch RPC calls, each
--     its own transaction -- NOT one big function looping internally -- so
--     one merchant's failure (batching) or one batch's failed transfer
--     cannot roll back or block another's already-committed success. That is
--     the actual mechanism behind this migration's "partial-failure
--     isolation" guarantee; it is a consequence of how the TS layer calls
--     these functions, not something enforced inside a single function body.
--   * batch_merchant_settlement re-verifies merchant_connect_is_ready with
--     the SAME source of truth redeem_lokala_balance itself uses
--     (platform_config.stripe_livemode, read internally) -- never a
--     TS-side Stripe-key-prefix check, which could in principle drift from
--     the DB value redemption's own gate trusts.
--   * settlement_items.balance_redemption_id is UNIQUE (already enforced by
--     the original schema) -- a redemption can be inserted into at most one
--     settlement_item ever. That constraint is the actual backstop against
--     double-batching; the advisory lock + FOR UPDATE below only prevent two
--     concurrent runs from both computing a batch over the same rows (which
--     the unique constraint would otherwise turn into a hard failure on the
--     second insert, not a silent double-batch -- but failing loudly on a
--     benign concurrent re-run is worse than just serializing it).
--   * Fee math is never recomputed here: gross/tips/fees/net are sums of
--     balance_redemptions.{subtotal_cents,tip_cents,merchant_fee_cents,
--     merchant_payable_cents} exactly as redemption already computed and
--     stored them. settlement_items.payable_cents is
--     balance_redemptions.merchant_payable_cents verbatim, per row.
--   * Stripe idempotency: the key is deterministic per (batch, attempt
--     number), not per batch alone. A batch-id-only key would collide with
--     stripe_transfer_attempts.idempotency_key's UNIQUE constraint on a
--     genuine retry (a new row per attempt, by design -- see that table's
--     comment in 20260901000007). Keying by (batch, attempt) still makes a
--     given attempt's OWN retry (e.g. a network blip between calling Stripe
--     and recording the result) safe to replay with Stripe, while a
--     deliberate new attempt after a real failure gets a fresh key and a
--     fresh row -- never overwriting the prior failed one.

-- ---------------------------------------------------------------------------
-- 1. Which merchants have at least one completed, not-yet-batched
--    redemption. Read-only; used by the TS orchestrator to know who to loop
--    over for batching.
-- ---------------------------------------------------------------------------
create or replace function app_private.list_merchants_pending_settlement()
returns table (
  merchant_account_id uuid,
  pending_redemption_count bigint
)
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select r.merchant_account_id, count(*) as pending_redemption_count
  from public.balance_redemptions r
  where r.status = 'completed'
    and not exists (
      select 1 from public.settlement_items si
      where si.balance_redemption_id = r.id
    )
  group by r.merchant_account_id
  order by r.merchant_account_id;
$$;

revoke all on function app_private.list_merchants_pending_settlement() from public;
grant execute on function app_private.list_merchants_pending_settlement() to service_role;

create or replace function public.service_list_merchants_pending_settlement()
returns table (
  merchant_account_id uuid,
  pending_redemption_count bigint
)
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select * from app_private.list_merchants_pending_settlement();
$$;

revoke all on function public.service_list_merchants_pending_settlement() from public, anon, authenticated;
grant execute on function public.service_list_merchants_pending_settlement() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Batch one merchant's pending redemptions. Re-verifies Connect
--    readiness; returns a status the caller must branch on rather than
--    assume success -- 'not_ready' and 'nothing_to_settle' are not errors,
--    just non-batching outcomes the caller reports distinctly.
-- ---------------------------------------------------------------------------
create or replace function app_private.batch_merchant_settlement(
  p_merchant_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_cfg app_private.platform_config%rowtype;
  v_ready boolean;
  v_redemption_ids uuid[];
  v_count integer;
  v_gross bigint;
  v_tips bigint;
  v_fees bigint;
  v_net bigint;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_latest_redemption_at timestamptz;
  v_batch_id uuid;
begin
  perform app_private.assert_service_role();

  if p_merchant_account_id is null then
    raise exception 'merchant_account_id is required';
  end if;

  -- Serializes concurrent batching runs for the SAME merchant. A different
  -- merchant proceeds independently and is never blocked by this.
  perform pg_advisory_xact_lock(
    hashtextextended('lokala.settlement.batch:' || p_merchant_account_id::text, 0)
  );

  select * into v_cfg from app_private.platform_config where id = 'mvp' for share;

  v_ready := app_private.merchant_connect_is_ready(p_merchant_account_id, v_cfg.stripe_livemode);
  if not v_ready then
    return jsonb_build_object(
      'status', 'not_ready',
      'merchant_account_id', p_merchant_account_id
    );
  end if;

  with locked as (
    select r.id, r.subtotal_cents, r.tip_cents, r.merchant_fee_cents,
           r.merchant_payable_cents, r.created_at
    from public.balance_redemptions r
    where r.merchant_account_id = p_merchant_account_id
      and r.status = 'completed'
      and not exists (
        select 1 from public.settlement_items si
        where si.balance_redemption_id = r.id
      )
    order by r.created_at asc
    for update of r
  )
  select
    array_agg(id),
    count(*),
    coalesce(sum(subtotal_cents), 0),
    coalesce(sum(tip_cents), 0),
    coalesce(sum(merchant_fee_cents), 0),
    coalesce(sum(merchant_payable_cents), 0),
    min(created_at),
    max(created_at)
  into v_redemption_ids, v_count, v_gross, v_tips, v_fees, v_net, v_period_start, v_latest_redemption_at
  from locked;

  if v_count = 0 then
    return jsonb_build_object(
      'status', 'nothing_to_settle',
      'merchant_account_id', p_merchant_account_id
    );
  end if;

  -- period_end must be strictly after period_start (settlement_batches'
  -- own check constraint) even when this all happens inside one transaction
  -- (now() is stable for the whole transaction in Postgres, so it can tie
  -- with a redemption's created_at -- true of every pgTAP test here, and of
  -- a real caller batching immediately after a redemption in the same
  -- request). Basing it on whichever is later, plus a strictly-positive
  -- nudge, guarantees the constraint holds either way.
  v_period_end := greatest(timezone('utc', now()), v_latest_redemption_at) + interval '1 millisecond';

  insert into public.settlement_batches (
    merchant_account_id, period_start, period_end,
    gross_subtotal_cents, tips_cents, merchant_fees_cents, net_payable_cents,
    currency, status
  ) values (
    p_merchant_account_id, v_period_start, v_period_end,
    v_gross, v_tips, v_fees, v_net, v_cfg.currency, 'pending'
  )
  returning id into v_batch_id;

  insert into public.settlement_items (settlement_batch_id, balance_redemption_id, payable_cents)
  select v_batch_id, r.id, r.merchant_payable_cents
  from public.balance_redemptions r
  where r.id = any(v_redemption_ids);

  return jsonb_build_object(
    'status', 'batched',
    'merchant_account_id', p_merchant_account_id,
    'settlement_batch_id', v_batch_id,
    'redemption_count', v_count,
    'gross_subtotal_cents', v_gross,
    'tips_cents', v_tips,
    'merchant_fees_cents', v_fees,
    'net_payable_cents', v_net,
    'currency', v_cfg.currency
  );
end;
$$;

revoke all on function app_private.batch_merchant_settlement(uuid) from public;
grant execute on function app_private.batch_merchant_settlement(uuid) to service_role;

create or replace function public.service_batch_merchant_settlement(
  p_merchant_account_id uuid
)
returns jsonb
language sql
security definer
set search_path = app_private, public, pg_temp
as $$
  select app_private.batch_merchant_settlement(p_merchant_account_id);
$$;

revoke all on function public.service_batch_merchant_settlement(uuid) from public, anon, authenticated;
grant execute on function public.service_batch_merchant_settlement(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. How many transfer attempts a batch already has -- read before building
--    the next deterministic idempotency key, so it embeds the correct
--    attempt number without a race (the batch-status claim in the TS layer
--    already serializes concurrent transfer attempts for the same batch
--    before this is ever called).
-- ---------------------------------------------------------------------------
create or replace function app_private.count_stripe_transfer_attempts(
  p_settlement_batch_id uuid
)
returns integer
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select count(*)::integer
  from app_private.stripe_transfer_attempts
  where settlement_batch_id = p_settlement_batch_id;
$$;

revoke all on function app_private.count_stripe_transfer_attempts(uuid) from public;
grant execute on function app_private.count_stripe_transfer_attempts(uuid) to service_role;

create or replace function public.service_count_stripe_transfer_attempts(
  p_settlement_batch_id uuid
)
returns integer
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select app_private.count_stripe_transfer_attempts(p_settlement_batch_id);
$$;

revoke all on function public.service_count_stripe_transfer_attempts(uuid) from public, anon, authenticated;
grant execute on function public.service_count_stripe_transfer_attempts(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Record one Stripe transfer attempt (success or failure). Always an
--    INSERT -- the guard trigger from 20260901000007 already rejects
--    mutating a failed/succeeded row, so this never tries to update one.
-- ---------------------------------------------------------------------------
create or replace function app_private.record_stripe_transfer_attempt(
  p_settlement_batch_id uuid,
  p_idempotency_key text,
  p_amount_cents bigint,
  p_status text,
  p_attempt_count integer,
  p_stripe_transfer_id text default null,
  p_failure_code text default null,
  p_failure_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform app_private.assert_service_role();

  if p_status not in ('succeeded', 'failed') then
    raise exception 'record_stripe_transfer_attempt: status must be succeeded or failed';
  end if;

  insert into app_private.stripe_transfer_attempts (
    settlement_batch_id, stripe_transfer_id, idempotency_key, amount_cents,
    currency, status, failure_code, failure_message, attempt_count
  ) values (
    p_settlement_batch_id, p_stripe_transfer_id, p_idempotency_key, p_amount_cents,
    'USD', p_status, p_failure_code, p_failure_message, p_attempt_count
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'attempt_count', p_attempt_count, 'status', p_status);
end;
$$;

revoke all on function app_private.record_stripe_transfer_attempt(
  uuid, text, bigint, text, integer, text, text, text
) from public;
grant execute on function app_private.record_stripe_transfer_attempt(
  uuid, text, bigint, text, integer, text, text, text
) to service_role;

create or replace function public.service_record_stripe_transfer_attempt(
  p_settlement_batch_id uuid,
  p_idempotency_key text,
  p_amount_cents bigint,
  p_status text,
  p_attempt_count integer,
  p_stripe_transfer_id text default null,
  p_failure_code text default null,
  p_failure_message text default null
)
returns jsonb
language sql
security definer
set search_path = app_private, public, pg_temp
as $$
  select app_private.record_stripe_transfer_attempt(
    p_settlement_batch_id, p_idempotency_key, p_amount_cents, p_status,
    p_attempt_count, p_stripe_transfer_id, p_failure_code, p_failure_message
  );
$$;

revoke all on function public.service_record_stripe_transfer_attempt(
  uuid, text, bigint, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.service_record_stripe_transfer_attempt(
  uuid, text, bigint, text, integer, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Read back a batch's attempt history -- observability for the admin
--    route's response and for manual investigation of a failed batch.
-- ---------------------------------------------------------------------------
create or replace function app_private.list_stripe_transfer_attempts(
  p_settlement_batch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'stripe_transfer_id', a.stripe_transfer_id,
      'idempotency_key', a.idempotency_key,
      'amount_cents', a.amount_cents,
      'status', a.status,
      'failure_code', a.failure_code,
      'failure_message', a.failure_message,
      'attempt_count', a.attempt_count,
      'created_at', a.created_at
    ) order by a.attempt_count asc
  ), '[]'::jsonb)
  from app_private.stripe_transfer_attempts a
  where a.settlement_batch_id = p_settlement_batch_id;
$$;

revoke all on function app_private.list_stripe_transfer_attempts(uuid) from public;
grant execute on function app_private.list_stripe_transfer_attempts(uuid) to service_role;

create or replace function public.service_list_stripe_transfer_attempts(
  p_settlement_batch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select app_private.list_stripe_transfer_attempts(p_settlement_batch_id);
$$;

revoke all on function public.service_list_stripe_transfer_attempts(uuid) from public, anon, authenticated;
grant execute on function public.service_list_stripe_transfer_attempts(uuid) to service_role;
