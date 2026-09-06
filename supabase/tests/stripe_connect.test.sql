-- Stripe Connect onboarding / reservation / readiness tests (standard pgTAP).
-- Run: npx supabase test db --local
-- Do not run against remote projects.

begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('lokala-stripe-connect:' || p_label)::uuid;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values
  (
    pg_temp.uid('owner'), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'connect-owner@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Connect Owner"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), false, false
  ),
  (
    pg_temp.uid('admin'), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'connect-admin@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Connect Admin"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), false, false
  ),
  (
    pg_temp.uid('staff'), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'connect-staff@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Connect Staff"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), false, false
  ),
  (
    pg_temp.uid('customer'), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'connect-customer@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Connect Customer"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), false, false
  ),
  (
    pg_temp.uid('owner_b'), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'connect-owner-b@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Connect Owner B"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), false, false
  );

insert into public.merchant_accounts (id, display_name, status, created_by)
values
  (pg_temp.uid('merchant'), 'Connect Cafe', 'active', pg_temp.uid('owner')),
  (pg_temp.uid('merchant_b'), 'Other Cafe', 'active', pg_temp.uid('owner_b'));

insert into public.merchant_members (merchant_account_id, user_id, role, status)
values
  (pg_temp.uid('merchant'), pg_temp.uid('owner'), 'owner', 'active'),
  (pg_temp.uid('merchant'), pg_temp.uid('admin'), 'admin', 'active'),
  (pg_temp.uid('merchant'), pg_temp.uid('staff'), 'staff', 'active'),
  (pg_temp.uid('merchant_b'), pg_temp.uid('owner_b'), 'owner', 'active');

-- Ready settlement row: transfers + payouts, charges deliberately false.
insert into app_private.stripe_connected_accounts (
  merchant_account_id, stripe_account_id, livemode, onboarding_status,
  charges_enabled, payouts_enabled, transfers_enabled, details_submitted
) values (
  pg_temp.uid('merchant'), 'acct_connect_test', false, 'complete',
  false, true, true, true
);

create function pg_temp.set_user(p_label text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', pg_temp.uid(p_label)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', pg_temp.uid(p_label)::text,
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

-- 1. Owner can read connect status (no stripe_account_id)
set local role authenticated;
select pg_temp.set_user('owner');

select is(
  public.get_merchant_connect_status(pg_temp.uid('merchant')) ->> 'onboarding_status',
  'complete',
  '1: owner can read connect status'
);

select is(
  public.get_merchant_connect_status(pg_temp.uid('merchant')) ? 'stripe_account_id',
  false,
  '2: status RPC never returns stripe_account_id'
);

reset role;
set local role authenticated;
select pg_temp.set_user('admin');

select is(
  public.get_merchant_connect_status(pg_temp.uid('merchant')) ->> 'ready_for_settlement',
  'true',
  '3: admin can read connect status'
);

reset role;
set local role authenticated;
select pg_temp.set_user('staff');

select is(
  public.get_merchant_connect_status(pg_temp.uid('merchant')) ->> 'transfers_enabled',
  'true',
  '4: staff can read connect status'
);

reset role;
set local role authenticated;
select pg_temp.set_user('customer');

select throws_ok(
  $$select public.get_merchant_connect_status(md5('lokala-stripe-connect:merchant')::uuid)$$,
  '42501',
  'Not authorized',
  '5: customer cannot read another merchant connect status'
);

reset role;
set local role authenticated;
select pg_temp.set_user('owner_b');

select throws_ok(
  $$select public.get_merchant_connect_status(md5('lokala-stripe-connect:merchant')::uuid)$$,
  '42501',
  'Not authorized',
  '6: cross-merchant owner cannot read connect status'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$select public.get_merchant_connect_status(md5('lokala-stripe-connect:merchant')::uuid)$$,
  '42501',
  null,
  '7: anonymous cannot read connect status'
);

reset role;

-- 8-9. Ready without charges_enabled; charges-only is not sufficient.
select ok(
  app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), false),
  '8: ready without charges_enabled when transfers and payouts are complete'
);

update app_private.stripe_connected_accounts
set charges_enabled = true,
    transfers_enabled = false
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

select ok(
  not app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), false),
  '9: missing transfers blocks readiness even if charges_enabled'
);

update app_private.stripe_connected_accounts
set transfers_enabled = true,
    payouts_enabled = false,
    charges_enabled = false
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

select ok(
  not app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), false),
  '10: payouts disabled blocks readiness'
);

update app_private.stripe_connected_accounts
set payouts_enabled = true
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

select ok(
  not app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), true),
  '11: livemode mismatch blocks readiness'
);

update app_private.stripe_connected_accounts
set requirements_currently_due = '["external_account"]'::jsonb
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

select ok(
  not app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), false),
  '12: currently_due blocks readiness'
);

update app_private.stripe_connected_accounts
set requirements_currently_due = '[]'::jsonb,
    requirements_past_due = '["individual.verification.document"]'::jsonb
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

select ok(
  not app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), false),
  '13: past_due blocks readiness'
);

update app_private.stripe_connected_accounts
set requirements_past_due = '[]'::jsonb,
    requirements_eventually_due = '["individual.verification.document"]'::jsonb
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

select ok(
  app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), false),
  '14: eventually_due does not block readiness'
);

update app_private.stripe_connected_accounts
set disabled_reason = 'requirements.past_due',
    onboarding_status = 'disabled'
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

select ok(
  not app_private.merchant_connect_is_ready(pg_temp.uid('merchant'), false),
  '15: disabled_reason blocks readiness'
);

-- Restore a complete test-mode row for reservation uniqueness tests.
update app_private.stripe_connected_accounts
set disabled_reason = null,
    onboarding_status = 'complete',
    requirements_eventually_due = '[]'::jsonb
where merchant_account_id = pg_temp.uid('merchant')
  and livemode = false;

-- 16-17. Test and live connected rows coexist; already_connected reuses the row.
select is(
  public.service_reserve_stripe_connect_account(pg_temp.uid('merchant'), false)
    ->> 'outcome',
  'already_connected',
  '16: existing current-mode account is reused'
);

select is(
  public.service_reserve_stripe_connect_account(pg_temp.uid('merchant'), true)
    ->> 'outcome',
  'needs_create',
  '17: live mode gets a separate reservation from test mode'
);

select is(
  (
    public.service_reserve_stripe_connect_account(pg_temp.uid('merchant'), true)
      ->> 'idempotency_key'
  ) =
  (
    public.service_reserve_stripe_connect_account(pg_temp.uid('merchant'), true)
      ->> 'idempotency_key'
  ),
  true,
  '18: concurrent reserve reuses the same stored idempotency key'
);

select isnt(
  public.service_reserve_stripe_connect_account(pg_temp.uid('merchant'), true)
    ->> 'idempotency_key',
  public.service_reserve_stripe_connect_account(pg_temp.uid('merchant_b'), true)
    ->> 'idempotency_key',
  '19: different merchants do not share idempotency keys'
);

-- 20. Failed finalization (empty account id) leaves no connected-account row.
select throws_ok(
  $$select public.service_finalize_stripe_connected_account(
    md5('lokala-stripe-connect:merchant')::uuid,
    true,
    '',
    'pending',
    false, false, false, false,
    null,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  null,
  'stripe_account_id is required',
  '20: empty stripe_account_id fails validation'
);

select is(
  (
    select count(*)::int
    from app_private.stripe_connected_accounts
    where merchant_account_id = pg_temp.uid('merchant')
      and livemode = true
  ),
  0,
  '21: failed finalization leaves no live connected-account row'
);

select is(
  (
    select status
    from app_private.stripe_connect_account_reservations
    where merchant_account_id = pg_temp.uid('merchant')
      and livemode = true
  ),
  'open',
  '22: failed finalization keeps the open reservation'
);

-- 23. Successful finalize writes one live row; test row remains.
select ok(
  (public.service_finalize_stripe_connected_account(
    pg_temp.uid('merchant'),
    true,
    'acct_connect_live',
    'pending',
    false, false, false, false,
    null,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  ) ->> 'finalized')::boolean,
  '23: successful Stripe create finalizes the connected-account row'
);

select is(
  (
    select count(*)::int
    from app_private.stripe_connected_accounts
    where merchant_account_id = pg_temp.uid('merchant')
  ),
  2,
  '24: test and live connected-account rows coexist'
);

select throws_ok(
  $$select public.service_finalize_stripe_connected_account(
    md5('lokala-stripe-connect:merchant')::uuid,
    true,
    'acct_connect_live_other',
    'pending',
    false, false, false, false,
    null,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  null,
  'Connected account already exists for this merchant and mode',
  '25: a second live Stripe account cannot be finalized'
);

-- 26. Stale reservation requires recovery and does not mint a new key.
insert into app_private.stripe_connect_account_reservations (
  merchant_account_id, livemode, stripe_idempotency_key, status, created_at
) values (
  pg_temp.uid('merchant_b'),
  false,
  'lokala_connect_stale_fixture_key',
  'open',
  timezone('utc', now()) - interval '25 hours'
);

select is(
  public.service_reserve_stripe_connect_account(pg_temp.uid('merchant_b'), false)
    ->> 'outcome',
  'recovery_required',
  '26: stale reservation requires recovery'
);

select is(
  (
    select stripe_idempotency_key
    from app_private.stripe_connect_account_reservations
    where merchant_account_id = pg_temp.uid('merchant_b')
      and livemode = false
  ),
  'lokala_connect_stale_fixture_key',
  '27: recovery does not generate a new idempotency key'
);

-- 28-30. No client grants on private objects / service RPCs.
set local role authenticated;
select pg_temp.set_user('owner');

select throws_ok(
  $$select count(*) from app_private.stripe_connect_account_reservations$$,
  '42501',
  null,
  '28: authenticated cannot read connect reservations'
);

select throws_ok(
  $$select public.service_reserve_stripe_connect_account(
    md5('lokala-stripe-connect:merchant')::uuid,
    false
  )$$,
  '42501',
  null,
  '29: authenticated cannot call reservation RPCs'
);

select throws_ok(
  $$select public.service_claim_stripe_webhook_event(
    'evt_connect_denied', 'account.updated', 'acct_x', false, 300
  )$$,
  '42501',
  null,
  '30: authenticated cannot claim webhook events'
);

reset role;
set local role anon;

select throws_ok(
  $$select count(*) from app_private.stripe_connected_accounts$$,
  '42501',
  null,
  '31: anonymous cannot read connected accounts'
);

reset role;

-- 32. Status for a merchant with no current-mode row is not_started.
set local role authenticated;
select pg_temp.set_user('owner_b');

select is(
  public.get_merchant_connect_status(pg_temp.uid('merchant_b')) ->> 'onboarding_status',
  'not_started',
  '32: missing current-mode account reports not_started'
);

reset role;

select * from finish();
rollback;
