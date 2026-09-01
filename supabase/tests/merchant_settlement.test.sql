-- Merchant settlement: batching + Stripe transfer attempt recording
-- (migration 20260901000020). Standard pgTAP only.
-- Run: npx supabase test db --local
-- Do not run against remote projects.

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- Deterministic fixture UUIDs (session-local helper; no tests schema).
create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('lokala-merchant-settlement:' || p_label)::uuid;
$$;

-- Directly inserts a completed redemption at the given subtotal/tip, computing
-- merchant_fee_cents the same way validate_balance_redemption_fee requires
-- (round(subtotal * bps / 10000)) so the fixture satisfies that trigger
-- without going through the full purchase/redeem_lokala_balance flow --
-- settlement doesn't care how a redemption was created, only that it exists
-- with status = 'completed'.
create function pg_temp.create_test_redemption(
  p_customer uuid,
  p_wallet uuid,
  p_merchant uuid,
  p_hub uuid,
  p_subtotal bigint,
  p_tip bigint,
  p_request text
)
returns uuid
language plpgsql
as $$
declare
  v_fee bigint := round((p_subtotal::numeric * 250) / 10000.0)::bigint;
  v_id uuid;
begin
  insert into public.balance_redemptions (
    customer_user_id, wallet_id, merchant_account_id, payment_hub_id,
    subtotal_cents, tip_cents, balance_debited_cents,
    merchant_fee_bps, merchant_fee_cents, merchant_payable_cents,
    currency, client_request_id, confirmation_code, status
  ) values (
    p_customer, p_wallet, p_merchant, p_hub,
    p_subtotal, p_tip, p_subtotal + p_tip,
    250, v_fee, p_subtotal - v_fee + p_tip,
    'USD', p_request, upper(left(md5(p_request || random()::text || clock_timestamp()::text), 8)), 'completed'
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: one Connect-ready merchant, one not-yet-ready merchant, a
-- customer with a wallet (wallet balance is irrelevant to settlement --
-- redemptions are inserted directly, already "completed").
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values (
  pg_temp.uid('customer'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'settlement-customer@example.test', crypt('placeholder', gen_salt('bf')),
  timezone('utc', now()), timezone('utc', now()), timezone('utc', now()),
  '{"provider":"email","providers":["email"]}', '{}', false, false
);

insert into public.merchant_accounts (id, display_name, status, created_by)
values
  (pg_temp.uid('merchant_ready'), 'Ready Merchant', 'active', pg_temp.uid('customer')),
  (pg_temp.uid('merchant_pending'), 'Pending Merchant', 'active', pg_temp.uid('customer'));

insert into public.payment_hubs (id, merchant_account_id, public_code, status)
values
  (pg_temp.uid('hub_ready'), pg_temp.uid('merchant_ready'), 'settlement-hub-ready', 'active'),
  (pg_temp.uid('hub_pending'), pg_temp.uid('merchant_pending'), 'settlement-hub-pending', 'active');

-- Only the "ready" merchant starts fully Connect-ready.
insert into app_private.stripe_connected_accounts (
  merchant_account_id, stripe_account_id, livemode, onboarding_status,
  charges_enabled, payouts_enabled, transfers_enabled, details_submitted
) values (
  pg_temp.uid('merchant_ready'), 'acct_settlement_ready', false, 'complete', true, true, true, true
);

do $$
declare
  v_wallet uuid;
begin
  select id into v_wallet from public.wallets where user_id = pg_temp.uid('customer');
  perform set_config('lokala_test.wallet_id', v_wallet::text, true);
end $$;

-- Two completed redemptions for the ready merchant: $40.00 + $5.00 tip
-- (fee = round(4000*250/10000) = 100, payable = 4000-100+500 = 4400), and
-- $20.00 + no tip (fee = 50, payable = 1950).
select pg_temp.create_test_redemption(
  pg_temp.uid('customer'), current_setting('lokala_test.wallet_id')::uuid,
  pg_temp.uid('merchant_ready'), pg_temp.uid('hub_ready'),
  4000, 500, 'settlement-redeem-1'
);
select pg_temp.create_test_redemption(
  pg_temp.uid('customer'), current_setting('lokala_test.wallet_id')::uuid,
  pg_temp.uid('merchant_ready'), pg_temp.uid('hub_ready'),
  2000, 0, 'settlement-redeem-2'
);

-- One completed redemption for the not-yet-ready merchant.
select pg_temp.create_test_redemption(
  pg_temp.uid('customer'), current_setting('lokala_test.wallet_id')::uuid,
  pg_temp.uid('merchant_pending'), pg_temp.uid('hub_pending'),
  1000, 100, 'settlement-redeem-pending-1'
);

-- ---------------------------------------------------------------------------
-- 1-3. Batching the ready merchant: correct status, fee math read (not
-- recomputed) from the redemptions, and a batch row matching those sums.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  r := public.service_batch_merchant_settlement(pg_temp.uid('merchant_ready'));
  perform set_config('lokala_test.batch_ready_1', r::text, true);
end $$;

select ok(
  (
    (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'status') = 'batched'
    and (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'redemption_count')::int = 2
    and (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'gross_subtotal_cents')::bigint = 6000
    and (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'tips_cents')::bigint = 500
    and (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'merchant_fees_cents')::bigint = 150
    and (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'net_payable_cents')::bigint = 6350
  ),
  '1: batching a ready merchant sums gross/tips/fees/net exactly from the two redemptions'
);

select ok(
  (
    select gross_subtotal_cents = 6000 and tips_cents = 500
      and merchant_fees_cents = 150 and net_payable_cents = 6350
      and status = 'pending' and currency = 'USD'
    from public.settlement_batches
    where id = (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'settlement_batch_id')::uuid
  ),
  '2: the settlement_batches row itself matches the returned totals and starts pending'
);

select ok(
  (
    select bool_and(si.payable_cents = r.merchant_payable_cents)
    from public.settlement_items si
    join public.balance_redemptions r on r.id = si.balance_redemption_id
    where si.settlement_batch_id = (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'settlement_batch_id')::uuid
  ),
  '3: each settlement_item.payable_cents is read verbatim from its redemption, never recomputed'
);

-- ---------------------------------------------------------------------------
-- 4-5. Idempotent batching: a second run over the same merchant finds
-- nothing left, and creates no new rows.
-- ---------------------------------------------------------------------------
select is(
  public.service_batch_merchant_settlement(pg_temp.uid('merchant_ready')) ->> 'status',
  'nothing_to_settle',
  '4: re-batching the same merchant with nothing new reports nothing_to_settle, not an error'
);

select is(
  (select count(*)::int from public.settlement_batches where merchant_account_id = pg_temp.uid('merchant_ready')),
  1,
  '5: re-batching did not create a second settlement_batches row'
);

select is(
  (select count(*)::int from public.settlement_items si
    join public.settlement_batches sb on sb.id = si.settlement_batch_id
    where sb.merchant_account_id = pg_temp.uid('merchant_ready')),
  2,
  '6: re-batching did not create any additional settlement_items rows (no redemption batched twice)'
);

-- ---------------------------------------------------------------------------
-- 6-8. Not-ready merchant: skipped and reported, not silently dropped -- its
-- redemption is untouched and still visible as pending settlement.
-- ---------------------------------------------------------------------------
select is(
  public.service_batch_merchant_settlement(pg_temp.uid('merchant_pending')) ->> 'status',
  'not_ready',
  '7: batching a merchant that is not Connect-ready reports not_ready'
);

select is(
  (select count(*)::int from public.settlement_items si
    join public.balance_redemptions r on r.id = si.balance_redemption_id
    where r.merchant_account_id = pg_temp.uid('merchant_pending')),
  0,
  '8: the not-ready merchant''s redemption was not batched'
);

select ok(
  exists (
    select 1 from public.service_list_merchants_pending_settlement() p
    where p.merchant_account_id = pg_temp.uid('merchant_pending')
      and p.pending_redemption_count = 1
  ),
  '9: the not-ready merchant''s redemption still shows up as pending settlement -- skipped, not dropped'
);

select ok(
  not exists (
    select 1 from public.service_list_merchants_pending_settlement() p
    where p.merchant_account_id = pg_temp.uid('merchant_ready')
  ),
  '10: the fully-batched ready merchant no longer appears in the pending-settlement list'
);

-- ---------------------------------------------------------------------------
-- 10. Once the previously not-ready merchant becomes Connect-ready, its
-- skipped redemption is picked up on the next batching run.
-- ---------------------------------------------------------------------------
insert into app_private.stripe_connected_accounts (
  merchant_account_id, stripe_account_id, livemode, onboarding_status,
  charges_enabled, payouts_enabled, transfers_enabled, details_submitted
) values (
  pg_temp.uid('merchant_pending'), 'acct_settlement_pending', false, 'complete', true, true, true, true
);

select is(
  public.service_batch_merchant_settlement(pg_temp.uid('merchant_pending')) ->> 'status',
  'batched',
  '11: the previously skipped merchant batches successfully once Connect-ready'
);

-- ---------------------------------------------------------------------------
-- 11. nothing_to_settle (distinct from not_ready) for a merchant with zero
-- completed redemptions at all.
-- ---------------------------------------------------------------------------
insert into public.merchant_accounts (id, display_name, status, created_by)
values (pg_temp.uid('merchant_empty'), 'Empty Merchant', 'active', pg_temp.uid('customer'));

insert into app_private.stripe_connected_accounts (
  merchant_account_id, stripe_account_id, livemode, onboarding_status,
  charges_enabled, payouts_enabled, transfers_enabled, details_submitted
) values (
  pg_temp.uid('merchant_empty'), 'acct_settlement_empty', false, 'complete', true, true, true, true
);

select is(
  public.service_batch_merchant_settlement(pg_temp.uid('merchant_empty')) ->> 'status',
  'nothing_to_settle',
  '12: a Connect-ready merchant with zero completed redemptions reports nothing_to_settle'
);

-- ---------------------------------------------------------------------------
-- 12. A reversed redemption is never batched.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  v_id := pg_temp.create_test_redemption(
    pg_temp.uid('customer'), current_setting('lokala_test.wallet_id')::uuid,
    pg_temp.uid('merchant_empty'), pg_temp.uid('hub_ready'),
    1500, 0, 'settlement-redeem-reversed'
  );
  update public.balance_redemptions set status = 'reversed' where id = v_id;
end $$;

select is(
  public.service_batch_merchant_settlement(pg_temp.uid('merchant_empty')) ->> 'status',
  'nothing_to_settle',
  '13: a reversed redemption is excluded from batching entirely'
);

-- ---------------------------------------------------------------------------
-- 13-16. Recording Stripe transfer attempts: every attempt is a new row,
-- never an overwrite of a prior failed or succeeded one.
-- ---------------------------------------------------------------------------
do $$
declare
  v_batch uuid := (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'settlement_batch_id')::uuid;
  r1 jsonb;
  r2 jsonb;
begin
  r1 := public.service_record_stripe_transfer_attempt(
    v_batch, 'lokala_settlement_transfer_' || v_batch::text || '_1', 6350, 'failed', 1,
    null, 'card_declined', 'The transfer was declined.'
  );
  r2 := public.service_record_stripe_transfer_attempt(
    v_batch, 'lokala_settlement_transfer_' || v_batch::text || '_2', 6350, 'succeeded', 2,
    'tr_test_settlement_1', null, null
  );
  perform set_config('lokala_test.attempt_1', r1::text, true);
  perform set_config('lokala_test.attempt_2', r2::text, true);
end $$;

select ok(
  (current_setting('lokala_test.attempt_1')::jsonb ->> 'status') = 'failed'
  and (current_setting('lokala_test.attempt_1')::jsonb ->> 'attempt_count')::int = 1
  and (current_setting('lokala_test.attempt_2')::jsonb ->> 'status') = 'succeeded'
  and (current_setting('lokala_test.attempt_2')::jsonb ->> 'attempt_count')::int = 2,
  '14: two attempts for the same batch record as two separate rows with the expected statuses'
);

select is(
  (
    select count(*)::int from app_private.stripe_transfer_attempts
    where settlement_batch_id = (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'settlement_batch_id')::uuid
  ),
  2,
  '15: both attempts persisted as distinct rows -- the failed one was never overwritten'
);

select ok(
  (
    select jsonb_array_length(r) = 2
      and r -> 0 ->> 'status' = 'failed'
      and r -> 1 ->> 'status' = 'succeeded'
    from (
      select public.service_list_stripe_transfer_attempts(
        (current_setting('lokala_test.batch_ready_1')::jsonb ->> 'settlement_batch_id')::uuid
      ) as r
    ) t
  ),
  '16: service_list_stripe_transfer_attempts returns both attempts in attempt order'
);

select throws_ok(
  $$update app_private.stripe_transfer_attempts
    set stripe_transfer_id = 'tr_should_not_apply'
    where status = 'failed'
      and idempotency_key like 'lokala_settlement_transfer_%_1'$$,
  '23001',
  null,
  '17: directly mutating a failed transfer attempt is rejected -- insert a new one instead'
);

-- ---------------------------------------------------------------------------
-- 17-24. Grants: none of these service_* wrappers are callable by anon or
-- authenticated -- service_role only, matching every other service_*
-- wrapper in this schema.
-- ---------------------------------------------------------------------------
set local role authenticated;

select throws_ok(
  $$select public.service_list_merchants_pending_settlement()$$,
  '42501',
  null,
  '18: authenticated cannot call service_list_merchants_pending_settlement'
);

select throws_ok(
  $$select public.service_batch_merchant_settlement('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  '19: authenticated cannot call service_batch_merchant_settlement'
);

select throws_ok(
  $$select public.service_count_stripe_transfer_attempts('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  '20: authenticated cannot call service_count_stripe_transfer_attempts'
);

select throws_ok(
  $$select public.service_record_stripe_transfer_attempt(
      '00000000-0000-0000-0000-000000000000'::uuid, 'x', 100, 'failed', 1
    )$$,
  '42501',
  null,
  '21: authenticated cannot call service_record_stripe_transfer_attempt'
);

select throws_ok(
  $$select public.service_list_stripe_transfer_attempts('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  '22: authenticated cannot call service_list_stripe_transfer_attempts'
);

reset role;

set local role anon;

select throws_ok(
  $$select public.service_batch_merchant_settlement('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  '23: anon cannot call service_batch_merchant_settlement'
);

select throws_ok(
  $$select public.service_record_stripe_transfer_attempt(
      '00000000-0000-0000-0000-000000000000'::uuid, 'x', 100, 'failed', 1
    )$$,
  '42501',
  null,
  '24: anon cannot call service_record_stripe_transfer_attempt'
);

reset role;

-- 24. Ledger sanity: none of this checkpoint's direct fixture inserts touch
-- the ledger, so posted transactions must still balance to zero.
select ok(
  not exists (
    select 1
    from app_private.ledger_transactions t
    join app_private.ledger_entries e on e.ledger_transaction_id = t.id
    where t.status = 'posted'
    group by t.id, e.currency
    having sum(e.amount_cents) <> 0
  ),
  '25: posted ledger transactions still balance to zero after settlement activity'
);

select * from finish();
rollback;
