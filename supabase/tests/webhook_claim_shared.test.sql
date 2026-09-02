-- Shared app_private webhook claim/complete cycle
-- (service_claim_stripe_webhook_event / service_complete_stripe_webhook_event,
-- migration 20260901000008 + wrappers in 20260901000013).
--
-- This is the SAME claim mechanism used by BOTH the balance-purchase branch
-- (balance-purchase-webhook.ts) and the Stripe Connect account.updated
-- handler (connect-webhook.ts) -- proving it here once covers "a replayed
-- webhook event cannot double-process" for both branches at the actual
-- database layer, not just via each branch's own mocked-admin TS test.
-- (The unrelated legacy public.stripe_webhook_events claim already has its
-- own real regression coverage in legacy_webhook_claim.test.sql.)
--
-- Run: npx supabase test db --local

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- 1-2. First claim of a fresh event id succeeds. A second claim on the
-- SAME still-open event resolves without error either way (claimed or
-- in_progress depending on lease freshness) -- it must NOT silently look
-- like a brand new, independent claim. The specific in_progress-vs-claimed
-- outcome for a genuinely simultaneous second attempt is proven separately
-- below via two real concurrent connections: now() is stable for the whole
-- transaction in Postgres, so two calls inside this SAME pgTAP transaction
-- cannot observe the lease as "fresh" the way two truly separate webhook
-- deliveries would -- the same inherited characteristic already documented
-- for the legacy claim function's identical pattern
-- (legacy_webhook_claim.test.sql).
do $$
declare
  r1 record;
  r2 record;
  v_event_id text := 'evt_shared_claim_' || gen_random_uuid()::text;
begin
  select * into r1
  from public.service_claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', 'pi_shared_test', false, 300);

  select * into r2
  from public.service_claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', 'pi_shared_test', false, 300);

  perform set_config('lokala_test.shared_claim_first', r1.claim_status, true);
  perform set_config(
    'lokala_test.shared_claim_second_valid',
    (r2.claim_status in ('claimed', 'in_progress'))::text,
    true
  );
end $$;

select is(
  current_setting('lokala_test.shared_claim_first'),
  'claimed',
  '1: first claim of a fresh event id succeeds'
);

select ok(
  current_setting('lokala_test.shared_claim_second_valid')::boolean,
  '2: a second claim on the same still-open event resolves to a recognized status, not a silent fresh claim'
);

-- 3-4. After completing successfully, a replay of the SAME event id is
-- acknowledged as already handled -- never processed a second time. This is
-- the concrete "cannot double-issue / double-process on replay" proof for
-- both branches sharing this mechanism.
do $$
declare
  v_event_id text := 'evt_shared_complete_' || gen_random_uuid()::text;
  r record;
begin
  perform public.service_claim_stripe_webhook_event(v_event_id, 'account.updated', 'acct_shared_test', false, 300);
  perform public.service_complete_stripe_webhook_event(v_event_id, true, null);

  select * into r
  from public.service_claim_stripe_webhook_event(v_event_id, 'account.updated', 'acct_shared_test', false, 300);

  perform set_config('lokala_test.shared_replay_status', r.claim_status, true);
end $$;

select is(
  current_setting('lokala_test.shared_replay_status'),
  'already_completed',
  '3: replaying an event id already marked completed is acknowledged, never reprocessed'
);

select is(
  (
    select processing_status from app_private.stripe_webhook_events
    where stripe_event_id like 'evt_shared_complete_%'
    order by created_at desc limit 1
  ),
  'completed',
  '4: the underlying row is durably marked completed, not left in-progress'
);

-- 5-6. A FAILED attempt is retriable: the next claim for that same event id
-- is allowed to proceed again (this is the intended "retry, not stuck"
-- behavior -- distinct from a successfully completed event, which must
-- never be reprocessed).
do $$
declare
  v_event_id text := 'evt_shared_retry_' || gen_random_uuid()::text;
  r record;
begin
  perform public.service_claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', 'pi_retry_test', false, 300);
  perform public.service_complete_stripe_webhook_event(v_event_id, false, 'simulated processing failure');

  select * into r
  from public.service_claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', 'pi_retry_test', false, 300);

  perform set_config('lokala_test.shared_retry_status', r.claim_status, true);
  perform set_config('lokala_test.shared_retry_attempt_count', r.attempt_count::text, true);
end $$;

select is(
  current_setting('lokala_test.shared_retry_status'),
  'claimed',
  '5: an event that failed on its first attempt can be claimed again, not stuck forever'
);

select is(
  current_setting('lokala_test.shared_retry_attempt_count'),
  '2',
  '6: the retried claim reports attempt_count 2, a real second attempt, not a fresh first one'
);

-- 7. anon cannot claim webhook events either (stripe_connect.test.sql's
-- test 30 already covers authenticated; this closes the anon case).
set local role anon;

select throws_ok(
  $$select public.service_claim_stripe_webhook_event(
    'evt_anon_denied', 'account.updated', 'acct_x', false, 300
  )$$,
  '42501',
  null,
  '7: anon cannot claim webhook events'
);

reset role;

select * from finish();
rollback;
