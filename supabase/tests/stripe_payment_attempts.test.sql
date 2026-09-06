-- app_private.stripe_payment_attempts recording (migration 20260901000021).
--
-- This table has existed since migration 20260901000008 but was never
-- populated by any application code until balance-purchase-webhook.ts was
-- updated to call service_record_stripe_payment_attempt on
-- payment_intent.succeeded. That TS-level call is proven against a mocked
-- admin in balance-purchase-webhook.test.ts (correct args, called once per
-- webhook delivery, failure never blocks the webhook); THIS file proves the
-- actual DB-level guarantee a mock cannot: that a replayed call with the
-- same idempotency_key really does insert exactly one row, not two, at the
-- unique-constraint layer -- and that the RLS/grant surface for both the
-- writer and the reader (service_get_stripe_payment_attempt_for_order, which
-- the refund path reads from) is service_role-only.
--
-- Run: npx supabase test db --local

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('lokala-stripe-payment-attempts:' || p_label)::uuid;
$$;

-- Fixture: one real user + one real payment_orders row for the FK.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values (
  pg_temp.uid('purchaser'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'attempts-purchaser@example.com', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
);

insert into public.payment_orders (
  id, user_id, kind, subtotal_cents, customer_fee_cents, total_cents,
  currency, pricing_version, client_request_id, status
) values (
  pg_temp.uid('order_1'), pg_temp.uid('purchaser'), 'balance_purchase', 2000, 60, 2060,
  'USD', 'colin_v1', 'req-attempts-1', 'paid'
);

-- 1. service_role can record a fresh attempt; reports inserted:true.
select is(
  (
    select (public.service_record_stripe_payment_attempt(
      pg_temp.uid('order_1')::uuid, 'pi_attempts_test_1', 2060, false, 'succeeded', 'idem_attempts_1'
    ) ->> 'inserted')
  ),
  'true',
  '1: a fresh idempotency_key inserts and reports inserted:true'
);

-- 2. Exactly one row exists for that PaymentIntent id.
select is(
  (
    select count(*)::int from app_private.stripe_payment_attempts
    where stripe_payment_intent_id = 'pi_attempts_test_1'
  ),
  1,
  '2: exactly one row exists after the first insert'
);

-- 3. Replaying with the SAME idempotency_key (same event redelivered) does
-- NOT create a second row -- the real proof a mocked TS test cannot give.
select is(
  (
    select (public.service_record_stripe_payment_attempt(
      pg_temp.uid('order_1')::uuid, 'pi_attempts_test_1', 2060, false, 'succeeded', 'idem_attempts_1'
    ) ->> 'inserted')
  ),
  'false',
  '3: replaying the same idempotency_key reports inserted:false, not a second row'
);

select is(
  (
    select count(*)::int from app_private.stripe_payment_attempts
    where stripe_payment_intent_id = 'pi_attempts_test_1'
  ),
  1,
  '4: still exactly one row after the replay'
);

-- 5. The surviving row carries the correct PaymentIntent id and amount from
-- the FIRST (winning) call.
select is(
  (
    select stripe_payment_intent_id from app_private.stripe_payment_attempts
    where idempotency_key = 'idem_attempts_1'
  ),
  'pi_attempts_test_1',
  '5: the row carries the correct PaymentIntent id'
);

select is(
  (
    select amount_cents from app_private.stripe_payment_attempts
    where idempotency_key = 'idem_attempts_1'
  ),
  2060::bigint,
  '6: the row carries the correct amount_cents'
);

-- 7. service_get_stripe_payment_attempt_for_order (the refund path's lookup)
-- resolves the same PaymentIntent id for that payment_order_id.
select is(
  (
    select public.service_get_stripe_payment_attempt_for_order(pg_temp.uid('order_1')::uuid)
      ->> 'stripe_payment_intent_id'
  ),
  'pi_attempts_test_1',
  '7: the reader resolves the correct PaymentIntent id for its payment_order_id'
);

-- 8. A payment_order_id with no recorded attempt resolves to null, not an
-- error -- the refund path must be able to distinguish "not refundable
-- through this path" from a real failure.
select is(
  public.service_get_stripe_payment_attempt_for_order(pg_temp.uid('order_none')::uuid),
  null::jsonb,
  '8: an order with no recorded attempt resolves to null'
);

-- 9. An invalid status is rejected outright, not silently stored.
select throws_ok(
  $$select public.service_record_stripe_payment_attempt(
    (select id from public.payment_orders limit 1), 'pi_bad_status', 100, false, 'bogus_status', 'idem_bad_status'
  )$$,
  null,
  null,
  '9: an invalid status is rejected, not silently stored'
);

-- 10-11. authenticated and anon cannot call either function directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('purchaser')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.service_record_stripe_payment_attempt(
    (select id from public.payment_orders limit 1), 'pi_denied', 100, false, 'succeeded', 'idem_denied_auth'
  )$$,
  '42501',
  null,
  '10: authenticated cannot record a stripe payment attempt directly'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.service_get_stripe_payment_attempt_for_order(
    (select id from public.payment_orders limit 1)
  )$$,
  '42501',
  null,
  '11: anon cannot read stripe payment attempts directly'
);

reset role;

select * from finish();
rollback;
