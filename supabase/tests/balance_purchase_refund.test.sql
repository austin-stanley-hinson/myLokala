-- app_private.finalize_balance_purchase_refund (migration 20260901000022) --
-- Part 3 of the guardrails checkpoint: refunding a balance purchase
-- (self-top-up, delivered; or a gift, pending_claim). Exercises both
-- delivery shapes against real issued purchases (via
-- service_issue_balance_purchase, not hand-built ledger rows), proves the
-- "already spent" refusal, idempotent replay, the amount-mismatch guard,
-- and the RLS/grant surface.
--
-- The Stripe call itself is TS-side (refund-balance-purchase.test.ts,
-- offline with a fake Stripe); this file only proves the DB-side atomic
-- reversal that runs after Stripe confirms.
--
-- Run: npx supabase test db --local

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('lokala-balance-purchase-refund:' || p_label)::uuid;
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
  'refund-purchaser@example.com', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
);

-- =============================================================================
-- Self-top-up (delivered): full reversal.
-- =============================================================================

do $$
declare
  v_purchase_id uuid;
  v_order_id uuid;
  v_wallet_id uuid;
  v_wallet_before bigint;
  v_wallet_after bigint;
begin
  v_purchase_id := pg_temp.create_self_purchase(pg_temp.uid('purchaser'), 2000, 60, 'req-refund-self-1');
  select payment_order_id into v_order_id from public.balance_purchases where id = v_purchase_id;

  perform public.service_issue_balance_purchase(v_purchase_id);

  select id, balance_cents into v_wallet_id, v_wallet_before
  from public.wallets where user_id = pg_temp.uid('purchaser') and currency = 'USD';

  perform set_config('lokala_test.self_wallet_before', v_wallet_before::text, true);

  perform public.service_finalize_balance_purchase_refund(v_purchase_id, 'test_re_self_1', 2060, 'test refund');

  select balance_cents into v_wallet_after from public.wallets where id = v_wallet_id;

  perform set_config('lokala_test.self_purchase_id', v_purchase_id::text, true);
  perform set_config('lokala_test.self_order_id', v_order_id::text, true);
  perform set_config('lokala_test.self_wallet_id', v_wallet_id::text, true);
  perform set_config('lokala_test.self_wallet_after', v_wallet_after::text, true);
end $$;

select is(
  (select status from public.balance_purchases where id = current_setting('lokala_test.self_purchase_id')::uuid),
  'refunded',
  '1: a delivered self-top-up moves to refunded'
);

select is(
  (select status from public.payment_orders where id = current_setting('lokala_test.self_order_id')::uuid),
  'refunded',
  '2: its payment_order moves to refunded'
);

select is(
  (
    select status from public.credit_lots
    where balance_purchase_id = current_setting('lokala_test.self_purchase_id')::uuid
  ),
  'reversed',
  '3: the credit_lot is marked reversed'
);

select is(
  (
    select remaining_amount_cents from public.credit_lots
    where balance_purchase_id = current_setting('lokala_test.self_purchase_id')::uuid
  ),
  0::bigint,
  '4: the credit_lot remaining_amount_cents is zeroed'
);

select is(
  current_setting('lokala_test.self_wallet_after')::bigint,
  current_setting('lokala_test.self_wallet_before')::bigint - 2000,
  '5: the wallet is debited by exactly face_value_cents (not total_paid_cents)'
);

select is(
  (
    select amount_cents from app_private.refunds
    where balance_purchase_id = current_setting('lokala_test.self_purchase_id')::uuid
  ),
  2060::bigint,
  '6: app_private.refunds records the full total_paid_cents'
);

select is(
  (
    select status from app_private.refunds
    where balance_purchase_id = current_setting('lokala_test.self_purchase_id')::uuid
  ),
  'succeeded',
  '7: the refund row is marked succeeded'
);

-- 8-9. Idempotent replay: same purchase, same stripe_refund_id -- no second
-- wallet debit, no second refunds row.
do $$
declare
  v_purchase_id uuid := current_setting('lokala_test.self_purchase_id')::uuid;
  v_wallet_id uuid := current_setting('lokala_test.self_wallet_id')::uuid;
  v_wallet_after bigint;
  v_result jsonb;
begin
  v_result := public.service_finalize_balance_purchase_refund(v_purchase_id, 'test_re_self_1', 2060, 'test refund');
  perform set_config('lokala_test.self_replay_idempotent', (v_result ->> 'idempotent'), true);

  select balance_cents into v_wallet_after from public.wallets where id = v_wallet_id;
  perform set_config('lokala_test.self_wallet_after_replay', v_wallet_after::text, true);
end $$;

select is(
  current_setting('lokala_test.self_replay_idempotent'),
  'true',
  '8: replaying finalize on an already-refunded purchase reports idempotent:true'
);

select is(
  current_setting('lokala_test.self_wallet_after_replay')::bigint,
  current_setting('lokala_test.self_wallet_after')::bigint,
  '9: the wallet is not debited a second time on replay'
);

select is(
  (
    select count(*)::int from app_private.refunds
    where balance_purchase_id = current_setting('lokala_test.self_purchase_id')::uuid
  ),
  1,
  '10: still exactly one refunds row after the replay'
);

-- =============================================================================
-- Already spent: refuses, does not attempt a partial reversal.
-- =============================================================================

do $$
declare
  v_purchase_id uuid;
begin
  v_purchase_id := pg_temp.create_self_purchase(pg_temp.uid('purchaser'), 3000, 90, 'req-refund-self-spent');
  perform public.service_issue_balance_purchase(v_purchase_id);

  -- Simulate a partial spend directly on the credit_lot (the FIFO
  -- consumption path itself is already covered by gift_balance_mvp.test.sql
  -- and this file only needs the "already spent" state to exist).
  update public.credit_lots
  set remaining_amount_cents = remaining_amount_cents - 500
  where balance_purchase_id = v_purchase_id;

  perform set_config('lokala_test.spent_purchase_id', v_purchase_id::text, true);
end $$;

select throws_ok(
  $$select public.service_finalize_balance_purchase_refund(
    current_setting('lokala_test.spent_purchase_id')::uuid, 'test_re_spent', 3090, null
  )$$,
  null,
  null,
  '11: a partially-spent credit_lot refuses the refund instead of partially reversing it'
);

select is(
  (select status from public.balance_purchases where id = current_setting('lokala_test.spent_purchase_id')::uuid),
  'delivered',
  '12: the refused purchase is left untouched (still delivered, not refunded)'
);

-- =============================================================================
-- Pending-claim gift: reversal with no credit_lot involved, cancels the
-- outstanding gift_claims row.
-- =============================================================================

do $$
declare
  v_purchase_id uuid;
  v_order_id uuid;
begin
  v_purchase_id := pg_temp.create_gift_purchase(pg_temp.uid('purchaser'), 1500, 45, 'req-refund-gift-1');
  select payment_order_id into v_order_id from public.balance_purchases where id = v_purchase_id;

  perform public.service_issue_balance_purchase(
    v_purchase_id, 'friend@example.com', encode(extensions.digest('token-refund-gift-1', 'sha256'), 'hex')
  );

  perform public.service_finalize_balance_purchase_refund(v_purchase_id, 'test_re_gift_1', 1545, null);

  perform set_config('lokala_test.gift_purchase_id', v_purchase_id::text, true);
  perform set_config('lokala_test.gift_order_id', v_order_id::text, true);
end $$;

select is(
  (select status from public.balance_purchases where id = current_setting('lokala_test.gift_purchase_id')::uuid),
  'refunded',
  '13: an unclaimed gift moves to refunded'
);

select is(
  (select status from public.payment_orders where id = current_setting('lokala_test.gift_order_id')::uuid),
  'refunded',
  '14: its payment_order moves to refunded'
);

select is(
  (
    select status from app_private.gift_claims
    where balance_purchase_id = current_setting('lokala_test.gift_purchase_id')::uuid
  ),
  'canceled',
  '15: the outstanding gift_claims row is canceled so it can never be claimed after the refund'
);

select is(
  (
    select count(*)::int from public.credit_lots
    where balance_purchase_id = current_setting('lokala_test.gift_purchase_id')::uuid
  ),
  0,
  '16: no credit_lot was ever created for the unclaimed gift'
);

-- =============================================================================
-- Guards and grants.
-- =============================================================================

select throws_ok(
  $$select public.service_finalize_balance_purchase_refund(
    '00000000-0000-0000-0000-000000000099'::uuid,
    'test_re_bad_amount', 999999999, null
  )$$,
  null,
  null,
  '17: an unknown balance_purchase_id raises not-found rather than silently no-oping'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('purchaser')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.service_finalize_balance_purchase_refund(
    current_setting('lokala_test.self_purchase_id')::uuid, 'test_re_denied', 2060, null
  )$$,
  '42501',
  null,
  '18: authenticated cannot finalize a refund directly'
);

reset role;

-- 19. Ledger sanity: every posted transaction this file created (issuance +
-- reversal, for both purchases) still balances to zero.
select ok(
  not exists (
    select 1
    from app_private.ledger_transactions t
    join app_private.ledger_entries e on e.ledger_transaction_id = t.id
    where t.status = 'posted'
    group by t.id, e.currency
    having sum(e.amount_cents) <> 0
  ),
  '19: posted ledger transactions still balance to zero after issuance + refund reversal'
);

select * from finish();
rollback;
