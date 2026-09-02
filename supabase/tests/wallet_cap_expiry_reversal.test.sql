-- Part 4 of the guardrails checkpoint: does app_private.expire_pending_gift_claims
-- (migration 20260901000015) let a purchaser's wallet exceed
-- platform_config.max_wallet_balance_cents ($500 / 50000 cents) when an
-- unclaimed gift is reversed back to them?
--
-- Reading the function shows no cap check on its wallet credit, unlike
-- app_private.issue_balance_purchase and app_private.claim_pending_gift,
-- which both raise before crediting a wallet that would exceed the cap
-- (see migration 20260901000009). This file proves that reading empirically:
-- a wallet already near the cap really is pushed over it by expiry
-- reversal, without error -- and, for contrast, that a FRESH voluntary
-- purchase against that same over-cap wallet is still correctly rejected.
-- See the checkpoint report for the reasoning on whether this asymmetry is
-- correct.
--
-- Run: npx supabase test db --local

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('lokala-wallet-cap-expiry:' || p_label)::uuid;
$$;

create function pg_temp.create_self_purchase(
  p_user uuid, p_face bigint, p_fee bigint, p_request text
)
returns uuid
language plpgsql
as $$
declare
  v_order uuid;
  v_purchase uuid;
begin
  insert into public.payment_orders (
    user_id, kind, subtotal_cents, customer_fee_cents, total_cents,
    currency, pricing_version, client_request_id, status
  ) values (
    p_user, 'balance_purchase', p_face, p_fee, p_face + p_fee,
    'USD', 'colin_v1', p_request, 'awaiting_payment'
  ) returning id into v_order;

  insert into public.balance_purchases (
    purchaser_user_id, purchase_kind, recipient_user_id,
    face_value_cents, customer_fee_cents, total_paid_cents,
    currency, pricing_version, payment_order_id, status
  ) values (
    p_user, 'self_top_up', p_user,
    p_face, p_fee, p_face + p_fee,
    'USD', 'colin_v1', v_order, 'awaiting_payment'
  ) returning id into v_purchase;

  return v_purchase;
end;
$$;

create function pg_temp.create_gift_purchase(
  p_purchaser uuid, p_face bigint, p_fee bigint, p_request text
)
returns uuid
language plpgsql
as $$
declare
  v_order uuid;
  v_purchase uuid;
begin
  insert into public.payment_orders (
    user_id, kind, subtotal_cents, customer_fee_cents, total_cents,
    currency, pricing_version, client_request_id, status
  ) values (
    p_purchaser, 'balance_purchase', p_face, p_fee, p_face + p_fee,
    'USD', 'colin_v1', p_request, 'awaiting_payment'
  ) returning id into v_order;

  insert into public.balance_purchases (
    purchaser_user_id, purchase_kind, recipient_user_id,
    face_value_cents, customer_fee_cents, total_paid_cents,
    currency, pricing_version, payment_order_id, status
  ) values (
    p_purchaser, 'gift', null,
    p_face, p_fee, p_face + p_fee,
    'USD', 'colin_v1', v_order, 'awaiting_payment'
  ) returning id into v_purchase;

  return v_purchase;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values (
  pg_temp.uid('purchaser'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'wallet-cap-expiry@example.com', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
);

do $$
declare
  v_self_purchase uuid;
  v_gift_purchase uuid;
  v_hash text := encode(extensions.digest('wallet-cap-expiry-token', 'sha256'), 'hex');
  v_wallet_before bigint;
  v_wallet_after bigint;
begin
  -- Fund the purchaser's wallet to $480 (48000 cents) via a REAL delivered
  -- self-top-up (not a raw UPDATE) so it is backed by a real credit_lot, the
  -- same discipline used everywhere else in this session -- an inconsistent
  -- wallet.balance_cents with no backing lot would make redemption fail for
  -- reasons unrelated to what this file is testing. max_wallet_balance_cents
  -- and max_balance_purchase_cents are both 50000 (seeded, migration
  -- 20260901000004), so 48000 clears the purchase cap with room to spare.
  v_self_purchase := pg_temp.create_self_purchase(pg_temp.uid('purchaser'), 48000, 1440, 'req-wallet-cap-fund');
  perform app_private.issue_balance_purchase(v_self_purchase);

  select balance_cents into v_wallet_before
  from public.wallets where user_id = pg_temp.uid('purchaser') and currency = 'USD';
  perform set_config('lokala_test.wallet_before', v_wallet_before::text, true);

  -- Send a $100 (10000 cents) gift to an unknown recipient -- well under the
  -- purchase cap on its own, and the wallet is not touched by issuing it
  -- (money sits in unclaimed_gift_liability until claimed or expired).
  v_gift_purchase := pg_temp.create_gift_purchase(pg_temp.uid('purchaser'), 10000, 300, 'req-wallet-cap-gift');
  perform app_private.issue_balance_purchase(v_gift_purchase, 'unclaimed-recipient@example.test', v_hash);

  -- Backdate the claim past the (default 30-day) expiry window and expire it.
  update app_private.gift_claims
  set created_at = timezone('utc', now()) - interval '31 days'
  where balance_purchase_id = v_gift_purchase;

  perform app_private.expire_pending_gift_claims();

  select balance_cents into v_wallet_after
  from public.wallets where user_id = pg_temp.uid('purchaser') and currency = 'USD';
  perform set_config('lokala_test.wallet_after', v_wallet_after::text, true);
end $$;

-- 1. The wallet really was at $480 before expiry (sanity on the fixture).
select is(
  current_setting('lokala_test.wallet_before')::bigint,
  48000::bigint,
  '1: purchaser wallet funded to 48000 cents before the gift expires'
);

-- 2. Expiry reversal credited the full face value with NO cap check,
-- landing the wallet at 58000 -- past the 50000 max_wallet_balance_cents cap.
select is(
  current_setting('lokala_test.wallet_after')::bigint,
  58000::bigint,
  '2: expiry reversal credits the full 10000 even though it pushes the wallet to 58000, past the 50000 cap'
);

select ok(
  current_setting('lokala_test.wallet_after')::bigint > 50000,
  '3: confirms the post-reversal balance is genuinely over max_wallet_balance_cents, not coincidentally at/under it'
);

-- 4. Contrast: a FRESH, voluntary self-top-up against that SAME now-over-cap
-- wallet is still correctly rejected by issue_balance_purchase's explicit
-- cap check -- the asymmetry is real and specific to reversals, not a
-- general hole in cap enforcement.
select throws_ok(
  $$
    select app_private.issue_balance_purchase(
      pg_temp.create_self_purchase(pg_temp.uid('purchaser'), 100, 3, 'req-wallet-cap-fresh-over')
    )
  $$,
  null,
  'Wallet balance would exceed max_wallet_balance_cents',
  '4: a fresh voluntary purchase against the over-cap wallet is still rejected by the cap check'
);

select * from finish();
rollback;
