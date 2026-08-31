-- Gift-claim service wrappers, claim expiry window, and expiry reversal.
--
-- Adds the two remaining service_* wrappers for the gift-claim lifecycle
-- (claim wraps app_private.claim_pending_gift; token rotation wraps
-- app_private.rotate_gift_claim_token), following the exact pattern
-- established in 20260901000013_stripe_connect_onboarding.sql and
-- 20260901000014_service_issue_balance_purchase.sql: SECURITY DEFINER, a
-- pinned search_path, schema-qualified calls, execute revoked from
-- public/anon/authenticated and granted only to service_role.
--
-- Note: app_private.gift_claims.status uses 'pending' (not 'pending_claim' --
-- that value belongs to public.balance_purchases.status for the same
-- conceptual state). This migration is written against the actual schema.

-- ---------------------------------------------------------------------------
-- 1. Service wrappers: gift claim + claim-token rotation
-- ---------------------------------------------------------------------------
create or replace function public.service_claim_pending_gift(
  p_claim_token_hash text,
  p_claimant_user_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.claim_pending_gift(p_claim_token_hash, p_claimant_user_id);
$$;

revoke all on function public.service_claim_pending_gift(text, uuid)
  from public, anon, authenticated;
grant execute on function public.service_claim_pending_gift(text, uuid)
  to service_role;

create or replace function public.service_rotate_gift_claim_token(
  p_balance_purchase_id uuid,
  p_new_claim_token_hash text
)
returns void
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.rotate_gift_claim_token(p_balance_purchase_id, p_new_claim_token_hash);
$$;

revoke all on function public.service_rotate_gift_claim_token(uuid, text)
  from public, anon, authenticated;
grant execute on function public.service_rotate_gift_claim_token(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Claim expiry window on platform_config
-- ---------------------------------------------------------------------------
alter table app_private.platform_config
  add column if not exists expiry_days integer not null default 30
    check (expiry_days > 0);

comment on column app_private.platform_config.expiry_days is
  'Days an unclaimed gift_claims row stays pending before app_private.expire_pending_gift_claims() reverses it to the purchaser.';

-- ---------------------------------------------------------------------------
-- 3. Expire past-window pending gift claims, reversing to the purchaser
-- ---------------------------------------------------------------------------
-- Idempotent: only status = 'pending' rows past the window are selected, so a
-- repeat run finds nothing left to do. Never touches public.balance_purchases
-- -- app_private.claim_pending_gift already gates solely on gift_claims.status
-- ('pending' required), so marking the claim 'expired' here is sufficient by
-- itself to block a late claim; the purchase row's own 'pending_claim' status
-- is left as historical record of the original gift.
create or replace function app_private.expire_pending_gift_claims()
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, extensions, pg_temp
as $$
declare
  v_cfg app_private.platform_config%rowtype;
  v_claim app_private.gift_claims%rowtype;
  v_purchase public.balance_purchases%rowtype;
  v_wallet public.wallets%rowtype;
  v_lot_id uuid;
  v_unclaimed uuid;
  v_liability uuid;
  v_expired_count integer := 0;
  v_skipped_no_wallet_count integer := 0;
begin
  perform app_private.assert_service_role();

  select * into v_cfg from app_private.platform_config where id = 'mvp' for share;

  for v_claim in
    select *
    from app_private.gift_claims
    where status = 'pending'
      and created_at <= timezone('utc', now()) - make_interval(days => v_cfg.expiry_days)
    order by created_at asc
    for update
  loop
    select * into v_purchase
    from public.balance_purchases
    where id = v_claim.balance_purchase_id
    for update;

    if not found or v_purchase.status <> 'pending_claim' then
      -- Already claimed, canceled, or otherwise moved on through another
      -- path. Mark the claim expired so it is never reprocessed, but never
      -- move money for a purchase this function does not recognize as still
      -- outstanding.
      update app_private.gift_claims
      set status = 'expired'
      where id = v_claim.id;
      v_expired_count := v_expired_count + 1;
      continue;
    end if;

    select * into v_wallet
    from public.wallets
    where user_id = v_purchase.purchaser_user_id
      and currency = v_purchase.currency
    for update;

    if not found or v_wallet.status <> 'active' then
      -- Purchaser has no usable wallet right now (missing or frozen/closed).
      -- Leave this claim pending so a later run can retry once it is active.
      v_skipped_no_wallet_count := v_skipped_no_wallet_count + 1;
      continue;
    end if;

    insert into public.credit_lots (
      wallet_id,
      balance_purchase_id,
      original_amount_cents,
      remaining_amount_cents,
      status
    ) values (
      v_wallet.id,
      v_purchase.id,
      v_purchase.face_value_cents,
      v_purchase.face_value_cents,
      'available'
    )
    on conflict (balance_purchase_id, wallet_id) do nothing
    returning id into v_lot_id;

    if v_lot_id is not null then
      -- Reversing the purchaser's own money can legitimately push them over
      -- max_wallet_balance_cents; that cap only bounds a fresh credit
      -- (issue_balance_purchase / claim_pending_gift), not money coming back.
      update public.wallets
      set balance_cents = balance_cents + v_purchase.face_value_cents,
          version = version + 1
      where id = v_wallet.id;

      v_unclaimed := app_private.platform_account_id('unclaimed_gift_liability');
      v_liability := app_private.get_or_create_customer_liability(v_purchase.purchaser_user_id);

      perform app_private.post_ledger_transaction(
        'gift_expiry_reversal',
        'balance_purchase',
        v_purchase.id,
        'expire:' || v_purchase.id::text,
        jsonb_build_array(
          jsonb_build_object(
            'financial_account_id', v_unclaimed,
            'amount_cents', -v_purchase.face_value_cents
          ),
          jsonb_build_object(
            'financial_account_id', v_liability,
            'amount_cents', v_purchase.face_value_cents
          )
        )
      );
    end if;

    update app_private.gift_claims
    set status = 'expired'
    where id = v_claim.id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return jsonb_build_object(
    'expired_count', v_expired_count,
    'skipped_no_wallet_count', v_skipped_no_wallet_count
  );
end;
$$;

revoke all on function app_private.expire_pending_gift_claims() from public;
grant execute on function app_private.expire_pending_gift_claims() to service_role;

comment on function app_private.expire_pending_gift_claims() is
  'Reverses past-window pending gift claims to the original purchaser''s wallet. Not scheduled (no pg_cron call) -- run manually or wire a schedule in a later checkpoint.';
