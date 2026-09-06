-- Records a Stripe PaymentIntent against app_private.stripe_payment_attempts
-- (schema from migration 20260901000008, never populated by any application
-- code until now). Found during the settlement/refund audit checkpoint:
-- nothing anywhere links a balance_purchases row to its Stripe PaymentIntent
-- id, which a refund (or any future need to look up the original charge)
-- requires. This migration only adds the write path; balance-purchase-
-- webhook.ts is updated separately to call it once, additively, when a
-- balance-purchase PaymentIntent succeeds.
--
-- idempotency_key is the SAME deterministic key create-balance-purchase.ts
-- already derives from client_request_id (lokala_balance_<clientRequestId>)
-- -- reconstructed here from intent.metadata.client_request_id, which the
-- webhook already has. Reusing it (rather than inventing a second key) means
-- a replayed payment_intent.succeeded event naturally collides on the same
-- key; ON CONFLICT DO NOTHING makes that collision a safe no-op rather than
-- a second row.
create or replace function app_private.record_stripe_payment_attempt(
  p_payment_order_id uuid,
  p_stripe_payment_intent_id text,
  p_amount_cents bigint,
  p_livemode boolean,
  p_status text,
  p_idempotency_key text,
  p_stripe_charge_id text default null
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

  if p_status not in (
    'created', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled'
  ) then
    raise exception 'record_stripe_payment_attempt: invalid status %', p_status;
  end if;

  insert into app_private.stripe_payment_attempts (
    payment_order_id, stripe_payment_intent_id, stripe_charge_id,
    amount_cents, currency, livemode, status, idempotency_key
  ) values (
    p_payment_order_id, p_stripe_payment_intent_id, p_stripe_charge_id,
    p_amount_cents, 'USD', p_livemode, p_status, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'inserted', v_id is not null);
end;
$$;

revoke all on function app_private.record_stripe_payment_attempt(
  uuid, text, bigint, boolean, text, text, text
) from public;
grant execute on function app_private.record_stripe_payment_attempt(
  uuid, text, bigint, boolean, text, text, text
) to service_role;

create or replace function public.service_record_stripe_payment_attempt(
  p_payment_order_id uuid,
  p_stripe_payment_intent_id text,
  p_amount_cents bigint,
  p_livemode boolean,
  p_status text,
  p_idempotency_key text,
  p_stripe_charge_id text default null
)
returns jsonb
language sql
security definer
set search_path = app_private, public, pg_temp
as $$
  select app_private.record_stripe_payment_attempt(
    p_payment_order_id, p_stripe_payment_intent_id, p_amount_cents,
    p_livemode, p_status, p_idempotency_key, p_stripe_charge_id
  );
$$;

revoke all on function public.service_record_stripe_payment_attempt(
  uuid, text, bigint, boolean, text, text, text
) from public, anon, authenticated;
grant execute on function public.service_record_stripe_payment_attempt(
  uuid, text, bigint, boolean, text, text, text
) to service_role;

-- Read-back, for the refund path (Part 3) to look up the PaymentIntent id
-- for a given payment_order_id -- the most recent successful attempt, if
-- any.
create or replace function app_private.get_stripe_payment_attempt_for_order(
  p_payment_order_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select jsonb_build_object(
    'stripe_payment_intent_id', a.stripe_payment_intent_id,
    'stripe_charge_id', a.stripe_charge_id,
    'amount_cents', a.amount_cents,
    'livemode', a.livemode
  )
  from app_private.stripe_payment_attempts a
  where a.payment_order_id = p_payment_order_id
    and a.status = 'succeeded'
  order by a.created_at desc
  limit 1;
$$;

revoke all on function app_private.get_stripe_payment_attempt_for_order(uuid) from public;
grant execute on function app_private.get_stripe_payment_attempt_for_order(uuid) to service_role;

create or replace function public.service_get_stripe_payment_attempt_for_order(
  p_payment_order_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  select app_private.get_stripe_payment_attempt_for_order(p_payment_order_id);
$$;

revoke all on function public.service_get_stripe_payment_attempt_for_order(uuid) from public, anon, authenticated;
grant execute on function public.service_get_stripe_payment_attempt_for_order(uuid) to service_role;
