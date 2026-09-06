-- RLS/grant hardening audit: every table this rebuild touches, tested
-- adversarially -- try to read/write as the WRONG role and confirm it is
-- rejected, not just confirm the intended path works. Standard pgTAP only.
-- Run: npx supabase test db --local
-- Do not run against remote projects.
--
-- Key finding this file's assertions are written against (verified directly,
-- not assumed): Supabase's platform-level default grants on the `public`
-- schema give anon/authenticated broad table privileges (SELECT/INSERT/
-- UPDATE/DELETE) independent of this repo's own `grant select on ...`
-- statements in 20260901000010 -- those statements are not the real
-- enforcement boundary. RLS POLICIES are the entire enforcement layer for
-- every public table here: a table with only a SELECT policy rejects
-- INSERT/UPDATE/DELETE by matching zero rows (not a grant-denied error),
-- because the grant already exists but no policy authorizes the write.
-- app_private is a separate, stronger story: anon/authenticated have no
-- USAGE on the schema at all (checked directly below), so they cannot even
-- reference an app_private table, regardless of table grants or RLS.

begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('lokala-rls-hardening:' || p_label)::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Section A: foundational role facts these tests depend on.
-- ---------------------------------------------------------------------------
select ok(
  (select rolbypassrls from pg_roles where rolname = 'service_role'),
  '1: service_role bypasses RLS (the actual mechanism every service_* wrapper relies on)'
);

select ok(
  not (select rolbypassrls from pg_roles where rolname = 'authenticated')
  and not (select rolbypassrls from pg_roles where rolname = 'anon'),
  '2: neither anon nor authenticated bypasses RLS'
);

select ok(
  not has_schema_privilege('anon', 'app_private', 'USAGE')
  and not has_schema_privilege('authenticated', 'app_private', 'USAGE'),
  '3: neither anon nor authenticated has USAGE on app_private -- a wall before table grants or RLS are even reached'
);

-- ---------------------------------------------------------------------------
-- Section B: app_private, schema-wide sweep. Every table in this schema
-- must have zero policies (RLS-enabled-no-policy denies everyone but
-- bypassrls) and zero anon/authenticated grants. One real query covers
-- every current and future app_private table, including gift_claims,
-- financial_accounts, ledger_transactions, ledger_entries,
-- stripe_transfer_attempts, stripe_payment_attempts, stripe_webhook_events,
-- refunds, stripe_disputes, platform_config, stripe_connected_accounts.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_policies where schemaname = 'app_private'),
  0,
  '4: app_private has zero RLS policies anywhere -- every table there denies anon/authenticated by default'
);

select is(
  (
    select count(*)::int from information_schema.table_privileges
    where table_schema = 'app_private' and grantee in ('anon', 'authenticated')
  ),
  0,
  '5: app_private grants nothing at all to anon or authenticated, on any table'
);

select is(
  (
    select count(*)::int from information_schema.tables
    where table_schema = 'app_private' and table_type = 'BASE TABLE'
  ) > 5,
  true,
  '6: sanity check -- the sweep above is actually covering a non-trivial number of tables'
);

-- Hands-on: actually attempt to read the specific tables named in the audit
-- as authenticated, not just trust the metadata sweep above.
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select count(*) from app_private.gift_claims$$,
  '42501',
  null,
  '7: authenticated cannot query app_private.gift_claims directly'
);

select throws_ok(
  $$select count(*) from app_private.financial_accounts$$,
  '42501',
  null,
  '8: authenticated cannot query app_private.financial_accounts directly'
);

select throws_ok(
  $$select count(*) from app_private.ledger_transactions$$,
  '42501',
  null,
  '9: authenticated cannot query app_private.ledger_transactions directly'
);

select throws_ok(
  $$select count(*) from app_private.ledger_entries$$,
  '42501',
  null,
  '10: authenticated cannot query app_private.ledger_entries directly'
);

select throws_ok(
  $$select count(*) from app_private.stripe_transfer_attempts$$,
  '42501',
  null,
  '11: authenticated cannot query app_private.stripe_transfer_attempts directly'
);

select throws_ok(
  $$insert into app_private.refunds (balance_purchase_id, amount_cents, status)
    values (gen_random_uuid(), 100, 'pending')$$,
  '42501',
  null,
  '12: authenticated cannot insert into app_private.refunds directly'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section C: public schema, write-policy sweep. None of these seven tables
-- has an insert/update/delete policy for authenticated -- issuance,
-- redemption, and settlement must stay RPC-only. One real query covers all
-- seven at once.
-- ---------------------------------------------------------------------------
select is(
  (
    select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in (
        'wallets', 'credit_lots', 'balance_purchases', 'payment_orders',
        'balance_redemptions', 'settlement_batches', 'settlement_items'
      )
      and cmd <> 'SELECT'
      and 'authenticated' = any(roles)
  ),
  0,
  '13: none of the seven money tables has any non-SELECT policy for authenticated'
);

-- ---------------------------------------------------------------------------
-- Fixtures for the hands-on per-table tests below: two customers, two
-- merchants (one with a non-owner staff member, to prove staff cannot see
-- past their own merchant), a hub, a purchase, a redemption, a settlement
-- batch, a gift claim.
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  (pg_temp.uid('customer_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-customer-a@example.test', crypt('placeholder', gen_salt('bf')),
   timezone('utc', now()), timezone('utc', now()), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}', '{}', false, false),
  (pg_temp.uid('customer_b'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-customer-b@example.test', crypt('placeholder', gen_salt('bf')),
   timezone('utc', now()), timezone('utc', now()), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}', '{}', false, false),
  (pg_temp.uid('owner_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-owner-a@example.test', crypt('placeholder', gen_salt('bf')),
   timezone('utc', now()), timezone('utc', now()), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}', '{}', false, false),
  (pg_temp.uid('staff_b'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-staff-b@example.test', crypt('placeholder', gen_salt('bf')),
   timezone('utc', now()), timezone('utc', now()), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}', '{}', false, false);

insert into public.merchant_accounts (id, display_name, status, created_by)
values
  (pg_temp.uid('merchant_a'), 'RLS Merchant A', 'active', pg_temp.uid('owner_a')),
  (pg_temp.uid('merchant_b'), 'RLS Merchant B', 'active', pg_temp.uid('owner_a'));

insert into public.merchant_members (merchant_account_id, user_id, role, status)
values
  (pg_temp.uid('merchant_a'), pg_temp.uid('owner_a'), 'owner', 'active'),
  (pg_temp.uid('merchant_b'), pg_temp.uid('staff_b'), 'staff', 'active');

insert into public.payment_hubs (id, merchant_account_id, public_code, status)
values (pg_temp.uid('hub_a'), pg_temp.uid('merchant_a'), 'rls-hub-a', 'active');

do $$
declare
  v_wallet_a uuid;
  v_order uuid;
  v_purchase uuid;
  v_redemption uuid;
  v_batch uuid;
begin
  select id into v_wallet_a from public.wallets where user_id = pg_temp.uid('customer_a');

  insert into public.payment_orders (
    user_id, kind, subtotal_cents, customer_fee_cents, total_cents,
    currency, pricing_version, client_request_id, status
  ) values (
    pg_temp.uid('customer_a'), 'balance_purchase', 3000, 100, 3100,
    'USD', 'colin_v1', 'rls-order-1', 'created'
  ) returning id into v_order;

  insert into public.balance_purchases (
    purchaser_user_id, purchase_kind, recipient_user_id,
    face_value_cents, customer_fee_cents, total_paid_cents,
    currency, pricing_version, payment_order_id, status
  ) values (
    pg_temp.uid('customer_a'), 'self_top_up', pg_temp.uid('customer_a'),
    3000, 100, 3100, 'USD', 'colin_v1', v_order, 'awaiting_payment'
  ) returning id into v_purchase;

  insert into public.balance_redemptions (
    customer_user_id, wallet_id, merchant_account_id, payment_hub_id,
    subtotal_cents, tip_cents, balance_debited_cents,
    merchant_fee_bps, merchant_fee_cents, merchant_payable_cents,
    currency, client_request_id, confirmation_code, status
  ) values (
    pg_temp.uid('customer_a'), v_wallet_a, pg_temp.uid('merchant_a'), pg_temp.uid('hub_a'),
    1000, 0, 1000, 250, 25, 975, 'USD', 'rls-redeem-1', 'RLSTEST1', 'completed'
  ) returning id into v_redemption;

  insert into public.settlement_batches (
    merchant_account_id, period_start, period_end,
    gross_subtotal_cents, tips_cents, merchant_fees_cents, net_payable_cents,
    currency, status
  ) values (
    pg_temp.uid('merchant_a'), timezone('utc', now()) - interval '1 hour', timezone('utc', now()),
    1000, 0, 25, 975, 'USD', 'pending'
  ) returning id into v_batch;

  insert into public.settlement_items (settlement_batch_id, balance_redemption_id, payable_cents)
  values (v_batch, v_redemption, 975);

  perform set_config('lokala_test.purchase_id', v_purchase::text, true);
  perform set_config('lokala_test.redemption_id', v_redemption::text, true);
  perform set_config('lokala_test.batch_id', v_batch::text, true);
  perform set_config('lokala_test.wallet_a_id', v_wallet_a::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- wallets
-- ---------------------------------------------------------------------------
set local role anon;
select is(
  (select count(*)::int from public.wallets),
  0,
  '14: anon reads zero wallet rows despite the broad table grant -- RLS has no anon policy at all'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_b')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.wallets where user_id = pg_temp.uid('customer_a')),
  0,
  '15: customer_b reads zero rows for customer_a''s wallet'
);

update public.wallets set balance_cents = 999999 where user_id = pg_temp.uid('customer_a');
reset role;
select is(
  (select balance_cents from public.wallets where user_id = pg_temp.uid('customer_a')),
  0::bigint,
  '16: customer_b cannot write customer_a''s wallet balance (0 rows affected, not an error) -- verified bypassing RLS, since customer_b cannot even read the row to confirm it themselves'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::int from public.wallets where user_id = pg_temp.uid('customer_a')),
  1,
  '17: positive control -- customer_a reads exactly their own wallet'
);

update public.wallets set balance_cents = 999999 where user_id = pg_temp.uid('customer_a');
select is(
  (select balance_cents from public.wallets where user_id = pg_temp.uid('customer_a')),
  0::bigint,
  '18: customer_a cannot write their OWN wallet balance directly either -- issuance/redemption must stay RPC-only'
);

reset role;

-- ---------------------------------------------------------------------------
-- credit_lots
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_b')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int from public.credit_lots
    where wallet_id = current_setting('lokala_test.wallet_a_id')::uuid
  ),
  0,
  '19: customer_b reads zero rows for customer_a''s credit lots'
);

-- Unlike UPDATE/DELETE (which silently match zero visible rows when no
-- policy applies), INSERT has no "existing row" to hide behind: with no
-- INSERT policy granting a WITH CHECK, Postgres rejects it outright.
select throws_ok(
  $$insert into public.credit_lots (
      wallet_id, balance_purchase_id, original_amount_cents, remaining_amount_cents, status
    ) values (
      current_setting('lokala_test.wallet_a_id')::uuid,
      current_setting('lokala_test.purchase_id')::uuid,
      500000, 500000, 'available'
    )$$,
  '42501',
  null,
  '20: customer_b cannot insert a fabricated credit lot for customer_a''s wallet (RLS has no insert policy at all)'
);

reset role;

-- ---------------------------------------------------------------------------
-- balance_purchases / payment_orders
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_b')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int from public.balance_purchases
    where id = current_setting('lokala_test.purchase_id')::uuid
  ),
  0,
  '21: customer_b (not a party) reads zero rows for customer_a''s purchase'
);

select is(
  (select count(*)::int from public.payment_orders where user_id = pg_temp.uid('customer_a')),
  0,
  '22: customer_b reads zero rows for customer_a''s payment order'
);

update public.balance_purchases set status = 'delivered'
where id = current_setting('lokala_test.purchase_id')::uuid;
reset role;
select is(
  (select status from public.balance_purchases where id = current_setting('lokala_test.purchase_id')::uuid),
  'awaiting_payment',
  '23: customer_b cannot flip customer_a''s purchase to delivered (0 rows affected) -- verified bypassing RLS'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::int from public.balance_purchases
    where id = current_setting('lokala_test.purchase_id')::uuid
  ),
  1,
  '24: positive control -- customer_a (the purchaser) reads their own purchase'
);

reset role;

-- ---------------------------------------------------------------------------
-- balance_redemptions
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_b')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int from public.balance_redemptions
    where id = current_setting('lokala_test.redemption_id')::uuid
  ),
  0,
  '25: customer_b reads zero rows for customer_a''s redemption'
);

select set_config('request.jwt.claim.sub', pg_temp.uid('staff_b')::text, true);
select is(
  (
    select count(*)::int from public.balance_redemptions
    where id = current_setting('lokala_test.redemption_id')::uuid
  ),
  0,
  '26: merchant_b''s staff (a different merchant) reads zero rows for merchant_a''s redemption'
);

select set_config('request.jwt.claim.sub', pg_temp.uid('owner_a')::text, true);
select is(
  (
    select count(*)::int from public.balance_redemptions
    where id = current_setting('lokala_test.redemption_id')::uuid
  ),
  1,
  '27: positive control -- merchant_a''s own owner reads the redemption at their merchant'
);

update public.balance_redemptions set status = 'reversed'
where id = current_setting('lokala_test.redemption_id')::uuid;
select is(
  (select status from public.balance_redemptions where id = current_setting('lokala_test.redemption_id')::uuid),
  'completed',
  '28: even the merchant''s own owner cannot directly flip a redemption to reversed (0 rows affected)'
);

reset role;

-- ---------------------------------------------------------------------------
-- settlement_batches / settlement_items
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('staff_b')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int from public.settlement_batches
    where id = current_setting('lokala_test.batch_id')::uuid
  ),
  0,
  '29: merchant_b''s staff reads zero rows for merchant_a''s settlement batch'
);

select is(
  (
    select count(*)::int from public.settlement_items
    where settlement_batch_id = current_setting('lokala_test.batch_id')::uuid
  ),
  0,
  '30: merchant_b''s staff reads zero rows for merchant_a''s settlement items'
);

select set_config('request.jwt.claim.sub', pg_temp.uid('owner_a')::text, true);
select is(
  (
    select count(*)::int from public.settlement_batches
    where id = current_setting('lokala_test.batch_id')::uuid
  ),
  1,
  '31: positive control -- merchant_a''s owner reads their own settlement batch'
);

update public.settlement_batches set status = 'paid'
where id = current_setting('lokala_test.batch_id')::uuid;
select is(
  (select status from public.settlement_batches where id = current_setting('lokala_test.batch_id')::uuid),
  'pending',
  '32: even merchant_a''s own owner cannot directly mark their settlement batch paid (0 rows affected)'
);

reset role;

-- 33. Ledger sanity: none of this file's fixture inserts touched the
-- ledger, so posted transactions must still balance to zero.
select ok(
  not exists (
    select 1
    from app_private.ledger_transactions t
    join app_private.ledger_entries e on e.ledger_transaction_id = t.id
    where t.status = 'posted'
    group by t.id, e.currency
    having sum(e.amount_cents) <> 0
  ),
  '33: posted ledger transactions still balance to zero after this file''s adversarial activity'
);

select * from finish();
rollback;
