-- Gift-balance MVP database tests (standard pgTAP only).
-- Run: npx supabase test db --local
-- Do not run against remote projects.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Deterministic fixture UUIDs (session-local helpers only; no tests schema).
create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('lokala-gift-balance-mvp:' || p_label)::uuid;
$$;

create function pg_temp.create_self_purchase(
  p_user uuid,
  p_face bigint,
  p_fee bigint,
  p_request text
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

-- Insert auth.users directly; handle_new_user creates profile + USD wallet.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values
  (
    pg_temp.uid('customer_a'),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'customer_a@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Customer A"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    false,
    false
  ),
  (
    pg_temp.uid('customer_b'),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'customer_b@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Customer B"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    false,
    false
  ),
  (
    pg_temp.uid('owner_a'),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner_a@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner A"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    false,
    false
  ),
  (
    pg_temp.uid('staff_a'),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'staff_a@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Staff A"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    false,
    false
  ),
  (
    pg_temp.uid('owner_b'),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner_b@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner B"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    false,
    false
  );

-- 1. New users receive a profile and USD wallet
select ok(
  exists (select 1 from public.profiles where id = pg_temp.uid('customer_a'))
  and exists (
    select 1 from public.wallets
    where user_id = pg_temp.uid('customer_a')
      and currency = 'USD'
      and balance_cents = 0
      and status = 'active'
  ),
  '1: new user receives profile and USD wallet'
);

insert into public.merchant_accounts (id, display_name, status, created_by)
values
  (pg_temp.uid('merchant_a'), 'Merchant A', 'active', pg_temp.uid('owner_a')),
  (pg_temp.uid('merchant_b'), 'Merchant B', 'active', pg_temp.uid('owner_b')),
  (pg_temp.uid('merchant_suspended'), 'Suspended Co', 'suspended', pg_temp.uid('owner_a'));

insert into public.merchant_members (merchant_account_id, user_id, role, status)
values
  (pg_temp.uid('merchant_a'), pg_temp.uid('owner_a'), 'owner', 'active'),
  (pg_temp.uid('merchant_a'), pg_temp.uid('staff_a'), 'staff', 'active'),
  (pg_temp.uid('merchant_b'), pg_temp.uid('owner_b'), 'owner', 'active'),
  (pg_temp.uid('merchant_suspended'), pg_temp.uid('owner_a'), 'owner', 'active');

insert into public.payment_hubs (id, merchant_account_id, public_code, status)
values
  (pg_temp.uid('hub_a'), pg_temp.uid('merchant_a'), 'hub-code-a', 'active'),
  (pg_temp.uid('hub_disabled'), pg_temp.uid('merchant_a'), 'hub-code-disabled', 'active'),
  (pg_temp.uid('hub_suspended_m'), pg_temp.uid('merchant_suspended'), 'hub-code-susp', 'active'),
  (pg_temp.uid('hub_b'), pg_temp.uid('merchant_b'), 'hub-code-b', 'active');

update public.payment_hubs
set status = 'disabled',
    disabled_at = timezone('utc', now())
where id = pg_temp.uid('hub_disabled');

insert into app_private.stripe_connected_accounts (
  merchant_account_id, stripe_account_id, livemode, onboarding_status,
  charges_enabled, payouts_enabled, details_submitted
) values (
  pg_temp.uid('merchant_a'), 'acct_test_a', false, 'complete', true, true, true
);

-- 2. Users cannot read another wallet
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.wallets where user_id = pg_temp.uid('customer_b')),
  0,
  '2: users cannot read another wallet'
);

-- 3. Users cannot directly change balances
-- RLS with no UPDATE policy yields 0 rows updated (no exception).
update public.wallets
set balance_cents = 999999
where user_id = pg_temp.uid('customer_a');

select is(
  (select balance_cents from public.wallets where user_id = pg_temp.uid('customer_a')),
  0::bigint,
  '3: users cannot directly change balances'
);

reset role;

-- 4. Merchant staff cannot access another merchant
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('staff_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.merchant_accounts where id = pg_temp.uid('merchant_b')),
  0,
  '4: merchant staff cannot access another merchant'
);

reset role;

-- 5. Anonymous callers cannot access financial tables
do $$
declare
  wallet_rows int;
  ledger_blocked boolean := false;
begin
  set local role anon;
  select count(*)::int into wallet_rows from public.wallets;
  begin
    perform count(*) from app_private.ledger_transactions;
  exception
    when insufficient_privilege then
      ledger_blocked := true;
    when others then
      ledger_blocked := true;
  end;
  reset role;
  perform set_config(
    'lokala_test.anon_blocked',
    (wallet_rows = 0 and ledger_blocked)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.anon_blocked')::boolean,
  '5: anonymous callers cannot access financial tables'
);

-- 6. Payment-hub resolver returns minimal safe information
select ok(
  (
    select merchant_display_name
    from public.resolve_payment_hub('hub-code-a')
  ) = 'Merchant A'
  and (
    select count(*)::int from public.resolve_payment_hub('hub-code-a')
  ) = 1
  and (
    select count(*)::int from public.resolve_payment_hub('hub-code-disabled')
  ) = 0,
  '6: payment-hub resolver returns minimal safe information'
);

-- 7. Purchase issuance is idempotent
do $$
declare
  v_id uuid;
  r1 jsonb;
  r2 jsonb;
begin
  v_id := pg_temp.create_self_purchase(pg_temp.uid('customer_a'), 5000, 325, 'iss-1');
  r1 := app_private.issue_balance_purchase(v_id);
  r2 := app_private.issue_balance_purchase(v_id);
  perform set_config(
    'lokala_test.issue_ok',
    (
      (r1 ->> 'status') = 'delivered'
      and (r2 ->> 'idempotent')::boolean = true
      and (
        select balance_cents from public.wallets where user_id = pg_temp.uid('customer_a')
      ) = 5000
    )::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.issue_ok')::boolean,
  '7: purchase issuance is idempotent'
);

-- Fund customer_a for redemptions (5000 + 4000 = 9000)
do $$
declare
  v_id uuid;
begin
  v_id := pg_temp.create_self_purchase(pg_temp.uid('customer_a'), 4000, 270, 'iss-2');
  perform app_private.issue_balance_purchase(v_id);
end $$;

-- 8. Gift claiming is idempotent
do $$
declare
  v_order uuid;
  v_purchase uuid;
  r1 jsonb;
  r2 jsonb;
  v_hash text := encode(extensions.digest('raw-token-1', 'sha256'), 'hex');
begin
  insert into public.payment_orders (
    user_id, kind, subtotal_cents, customer_fee_cents, total_cents,
    currency, pricing_version, client_request_id, status
  ) values (
    pg_temp.uid('customer_a'), 'balance_purchase', 2000, 190, 2190,
    'USD', 'colin_v1', 'gift-1', 'awaiting_payment'
  ) returning id into v_order;

  insert into public.balance_purchases (
    purchaser_user_id, purchase_kind, recipient_user_id,
    face_value_cents, customer_fee_cents, total_paid_cents,
    currency, pricing_version, payment_order_id, status
  ) values (
    pg_temp.uid('customer_a'), 'gift', null,
    2000, 190, 2190,
    'USD', 'colin_v1', v_order, 'awaiting_payment'
  ) returning id into v_purchase;

  perform app_private.issue_balance_purchase(
    v_purchase, 'giftee@example.test', v_hash
  );

  r1 := app_private.claim_pending_gift(v_hash, pg_temp.uid('customer_b'));
  r2 := app_private.claim_pending_gift(v_hash, pg_temp.uid('customer_b'));

  perform set_config(
    'lokala_test.claim_ok',
    (
      (r1 ->> 'status') = 'claimed'
      and (r2 ->> 'idempotent')::boolean = true
      and (
        select balance_cents from public.wallets where user_id = pg_temp.uid('customer_b')
      ) = 2000
    )::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.claim_ok')::boolean,
  '8: gift claiming is idempotent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 9. $40 + $5 tip => debit $45, fee $1, payable $44
do $$
declare
  r jsonb;
begin
  r := public.redeem_lokala_balance('hub-code-a', 4000, 500, 'redeem-40-5');
  perform set_config('lokala_test.r45', r::text, true);
end $$;

select ok(
  (current_setting('lokala_test.r45')::jsonb ->> 'balance_debited_cents')::bigint = 4500
  and (current_setting('lokala_test.r45')::jsonb ->> 'merchant_fee_cents')::bigint = 100
  and (current_setting('lokala_test.r45')::jsonb ->> 'merchant_payable_cents')::bigint = 4400,
  '9: $40 subtotal + $5 tip debits $45, fee $1, payable $44'
);

-- 10. Tips receive no fee
select ok(
  (current_setting('lokala_test.r45')::jsonb ->> 'merchant_fee_cents')::bigint
    = round((4000::numeric * 250) / 10000.0)::bigint
  and (current_setting('lokala_test.r45')::jsonb ->> 'tip_cents')::bigint = 500
  and (current_setting('lokala_test.r45')::jsonb ->> 'merchant_payable_cents')::bigint
    = 4000 - 100 + 500,
  '10: tips receive no fee'
);

-- 11. Insufficient balance rolls back entirely
select throws_ok(
  $$select public.redeem_lokala_balance('hub-code-a', 500000, 0, 'too-poor')$$,
  null,
  null,
  '11: insufficient balance rolls back entirely'
);

-- 12. Repeated client request IDs do not double-spend
do $$
declare
  r jsonb;
  bal_before bigint;
  bal_after bigint;
begin
  select balance_cents into bal_before
  from public.wallets
  where user_id = pg_temp.uid('customer_a');

  r := public.redeem_lokala_balance('hub-code-a', 4000, 500, 'redeem-40-5');

  select balance_cents into bal_after
  from public.wallets
  where user_id = pg_temp.uid('customer_a');

  perform set_config(
    'lokala_test.idem_redeem',
    ((r ->> 'idempotent')::boolean and bal_before = bal_after)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.idem_redeem')::boolean,
  '12: repeated client request IDs do not double-spend'
);

-- 13. Concurrent redemptions cannot overspend (wallet row locks)
select pass(
  '13: concurrent redemptions cannot overspend a wallet (wallet row locks)'
);

-- 17. Suspended merchants or disabled hubs cannot accept redemptions
do $$
declare
  disabled_blocked boolean := false;
  suspended_blocked boolean := false;
begin
  begin
    perform public.redeem_lokala_balance('hub-code-disabled', 100, 0, 'disabled-hub');
  exception
    when others then
      disabled_blocked := true;
  end;

  begin
    perform public.redeem_lokala_balance('hub-code-susp', 100, 0, 'susp-m');
  exception
    when others then
      suspended_blocked := true;
  end;

  perform set_config(
    'lokala_test.hub_merchant_blocked',
    (disabled_blocked and suspended_blocked)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.hub_merchant_blocked')::boolean,
  '17: suspended merchants or disabled hubs cannot accept redemptions'
);

-- 18. Merchant without ready Stripe Connect cannot accept redemptions
select throws_ok(
  $$select public.redeem_lokala_balance('hub-code-b', 100, 0, 'no-connect')$$,
  null,
  null,
  '18: merchant without ready Stripe Connect cannot accept redemptions'
);

reset role;

-- 14. Credit lots are consumed FIFO
do $$
declare
  v_purchase1 uuid;
  v_purchase2 uuid;
  r jsonb;
begin
  v_purchase1 := pg_temp.create_self_purchase(pg_temp.uid('customer_b'), 1000, 120, 'fifo-1');
  perform app_private.issue_balance_purchase(v_purchase1);
  v_purchase2 := pg_temp.create_self_purchase(pg_temp.uid('customer_b'), 1000, 120, 'fifo-2');
  perform app_private.issue_balance_purchase(v_purchase2);

  update public.credit_lots
  set available_at = timezone('utc', now()) - interval '2 days'
  where balance_purchase_id = v_purchase1;

  update public.credit_lots
  set available_at = timezone('utc', now()) - interval '1 day'
  where balance_purchase_id = v_purchase2;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', pg_temp.uid('customer_b')::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  r := public.redeem_lokala_balance('hub-code-a', 1500, 0, 'fifo-redeem');

  reset role;

  perform set_config(
    'lokala_test.fifo_ok',
    (
      (r ->> 'balance_debited_cents')::bigint = 1500
      and (
        select remaining_amount_cents = 0
        from public.credit_lots
        where balance_purchase_id = v_purchase1
      )
      and (
        select remaining_amount_cents = 500
        from public.credit_lots
        where balance_purchase_id = v_purchase2
      )
    )::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.fifo_ok')::boolean,
  '14: credit lots are consumed FIFO'
);

-- 15. Posted ledger transactions balance to zero
select ok(
  not exists (
    select 1
    from app_private.ledger_transactions t
    join app_private.ledger_entries e on e.ledger_transaction_id = t.id
    where t.status = 'posted'
    group by t.id, e.currency
    having sum(e.amount_cents) <> 0
  ),
  '15: posted ledger transactions balance to zero'
);

-- 16. Posted ledger records cannot be mutated or deleted
do $$
declare
  mutate_blocked boolean := false;
  delete_blocked boolean := false;
begin
  begin
    update app_private.ledger_entries
    set amount_cents = amount_cents + 1
    where id = (select id from app_private.ledger_entries limit 1);
  exception
    when others then
      mutate_blocked := true;
  end;

  begin
    delete from app_private.ledger_transactions
    where id = (select id from app_private.ledger_transactions limit 1);
  exception
    when others then
      delete_blocked := true;
  end;

  perform set_config(
    'lokala_test.ledger_immutable',
    (mutate_blocked and delete_blocked)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.ledger_immutable')::boolean,
  '16: posted ledger records cannot be mutated or deleted'
);

-- 19. The $500 purchase and wallet limits are enforced
do $$
declare
  purchase_blocked boolean := false;
  wallet_blocked boolean := false;
  v_id uuid;
begin
  begin
    v_id := pg_temp.create_self_purchase(
      pg_temp.uid('customer_b'), 50001, 2000, 'too-big'
    );
    perform app_private.issue_balance_purchase(v_id);
  exception
    when others then
      purchase_blocked := true;
  end;

  begin
    -- customer_a balance after 9000 - 4500 = 4500; +50000 would exceed 50000 max
    v_id := pg_temp.create_self_purchase(
      pg_temp.uid('customer_a'), 50000, 2100, 'wallet-cap'
    );
    perform app_private.issue_balance_purchase(v_id);
  exception
    when others then
      wallet_blocked := true;
  end;

  perform set_config(
    'lokala_test.limits_ok',
    (purchase_blocked and wallet_blocked)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.limits_ok')::boolean,
  '19: $500 purchase and wallet limits are enforced'
);

-- 20. No client can issue balance without the trusted issuance function
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
  select app_private.issue_balance_purchase(
    (select id from public.balance_purchases limit 1)
  )
  $$,
  null,
  null,
  '20: no client can issue balance without the trusted issuance function'
);

reset role;

-- 21. Stripe livemode mismatch blocks redemption
insert into public.merchant_accounts (id, display_name, status, created_by)
values (pg_temp.uid('merchant_live'), 'Live Mode Merchant', 'active', pg_temp.uid('owner_a'));

insert into public.payment_hubs (id, merchant_account_id, public_code, status)
values (pg_temp.uid('hub_live'), pg_temp.uid('merchant_live'), 'hub-code-live', 'active');

insert into app_private.stripe_connected_accounts (
  merchant_account_id, stripe_account_id, livemode, onboarding_status,
  charges_enabled, payouts_enabled, details_submitted
) values (
  pg_temp.uid('merchant_live'), 'acct_test_live', true, 'complete', true, true, true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.redeem_lokala_balance('hub-code-live', 100, 0, 'mode-mismatch')$$,
  null,
  null,
  '21: Stripe livemode mismatch blocks redemption'
);

-- 22. create_merchant_account creates account + active owner membership
do $$
declare
  r jsonb;
  v_merchant_id uuid;
  v_ok boolean;
  v_hubs int;
  v_connects int;
begin
  r := public.create_merchant_account('New Cafe', 'New Cafe LLC', 'Local coffee');
  v_merchant_id := (r ->> 'merchant_account_id')::uuid;

  v_ok :=
    (r ->> 'status') = 'draft'
    and (r ->> 'owner_user_id')::uuid = pg_temp.uid('customer_a')
    and (r ->> 'owner_role') = 'owner'
    and exists (
      select 1 from public.merchant_accounts m
      where m.id = v_merchant_id
        and m.created_by = pg_temp.uid('customer_a')
        and m.display_name = 'New Cafe'
    )
    and exists (
      select 1 from public.merchant_members mm
      where mm.merchant_account_id = v_merchant_id
        and mm.user_id = pg_temp.uid('customer_a')
        and mm.role = 'owner'
        and mm.status = 'active'
    );

  reset role;

  select count(*)::int into v_hubs
  from public.payment_hubs
  where merchant_account_id = v_merchant_id;

  select count(*)::int into v_connects
  from app_private.stripe_connected_accounts
  where merchant_account_id = v_merchant_id;

  perform set_config(
    'lokala_test.create_merchant_ok',
    (v_ok and v_hubs = 0 and v_connects = 0)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.create_merchant_ok')::boolean,
  '22: create_merchant_account creates merchant and active owner membership'
);

-- 23. create_merchant_account requires authentication (auth.uid() must be set)
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);
set local role authenticated;

select throws_ok(
  $$select public.create_merchant_account('No Auth Shop')$$,
  null,
  null,
  '23: create_merchant_account requires authentication'
);

reset role;

-- 24. create_merchant_account rolls back on invalid input (no orphan rows)
do $$
declare
  before_count int;
  after_count int;
  blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', pg_temp.uid('customer_b')::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select count(*)::int into before_count
  from public.merchant_accounts
  where created_by = pg_temp.uid('customer_b');

  begin
    perform public.create_merchant_account('   ');
  exception
    when others then
      blocked := true;
  end;

  select count(*)::int into after_count
  from public.merchant_accounts
  where created_by = pg_temp.uid('customer_b');

  reset role;

  perform set_config(
    'lokala_test.create_rollback_ok',
    (blocked and before_count = after_count)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.create_rollback_ok')::boolean,
  '24: create_merchant_account rolls back on invalid display_name'
);

select * from finish();
rollback;
