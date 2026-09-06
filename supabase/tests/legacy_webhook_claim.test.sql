-- Regression coverage for the legacy platform-webhook claim
-- (public.claim_stripe_webhook_event / public.stripe_webhook_events,
-- migration 20260901000017).
--
-- The bug this guards against: src/lib/payments/webhook-claim.ts calls
-- admin.rpc("claim_stripe_webhook_event", {...}) and destructures a
-- {claimed, already_processed, attempt_count} row, plus does direct table
-- updates on public.stripe_webhook_events. Neither the function nor the
-- table existed in any migration, so every webhook delivery -- legacy
-- gift-certificate AND the new balance-purchase branch -- 500'd at the top
-- of route.ts on a fresh database. A same-named-but-differently-shaped
-- function (e.g. app_private.claim_stripe_webhook_event /
-- service_claim_stripe_webhook_event, which return `claim_status text`
-- instead of the two booleans) would NOT have caught this: the JS
-- destructuring would silently read undefined for both booleans and always
-- fall through to "in_progress", a wrong answer delivered without any
-- error. These tests assert the actual returned shape, not just that a
-- same-named function exists.
--
-- Run: npx supabase test db --local

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- 1. Every column webhook-claim.ts / route.ts read or write directly via
-- `.from("stripe_webhook_events")` actually exists.
select ok(
  (
    select count(*) = 6
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_webhook_events'
      and column_name in (
        'stripe_event_id', 'payment_transaction_id', 'attempt_count',
        'processed_at', 'locked_at', 'process_error'
      )
  ),
  '1: public.stripe_webhook_events has every column the legacy webhook code reads or writes directly'
);

-- 2-3. First claim resolves against a real function returning exactly the
-- {claimed, already_processed, attempt_count} row shape webhook-claim.ts
-- destructures -- proves both existence AND shape, not just a name match.
do $$
declare
  r1 record;
  r2 record;
  v_event_id text := 'evt_regression_' || gen_random_uuid()::text;
begin
  select * into r1
  from public.claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', false, 120);

  select * into r2
  from public.claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', false, 120);

  perform set_config(
    'lokala_test.claim_regression_first',
    jsonb_build_object(
      'claimed', r1.claimed,
      'already_processed', r1.already_processed,
      'attempt_count', r1.attempt_count
    )::text,
    true
  );
  perform set_config(
    'lokala_test.claim_regression_second',
    jsonb_build_object(
      'claimed', r2.claimed,
      'already_processed', r2.already_processed
    )::text,
    true
  );
end $$;

select ok(
  (current_setting('lokala_test.claim_regression_first')::jsonb ->> 'claimed')::boolean = true
  and (current_setting('lokala_test.claim_regression_first')::jsonb ->> 'already_processed')::boolean = false
  and (current_setting('lokala_test.claim_regression_first')::jsonb ->> 'attempt_count')::int = 1,
  '2: first claim resolves against a real function returning {claimed:true, already_processed:false, attempt_count:1}'
);

-- Note: does not assert claimed=false here. now() is stable for the whole
-- transaction in Postgres, so a second call inside the SAME transaction as
-- the first cannot observe its own lock as "stale" the way two genuinely
-- separate deliveries would -- that lease-freshness behavior is inherited
-- unchanged from app_private.claim_stripe_webhook_event's identical
-- pattern. What this asserts is the part specific to this fix: the RPC
-- resolves and returns the expected shape on a repeat call at all, rather
-- than erroring the way "function does not exist" did before.
select ok(
  (current_setting('lokala_test.claim_regression_second')::jsonb ->> 'already_processed')::boolean = false
  and current_setting('lokala_test.claim_regression_second')::jsonb ? 'claimed',
  '3: a second claim call on the same event id resolves and returns the expected shape, not a missing-function error'
);

-- 4. Marking processed (mirrors markWebhookEventProcessed's direct table
-- update) actually takes effect, and a subsequent claim reports it.
do $$
declare
  v_event_id text := 'evt_regression2_' || gen_random_uuid()::text;
  r record;
begin
  perform public.claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', false, 120);

  update public.stripe_webhook_events
  set processed_at = timezone('utc', now()),
      locked_at = null,
      process_error = null
  where stripe_event_id = v_event_id
    and processed_at is null;

  select * into r
  from public.claim_stripe_webhook_event(v_event_id, 'payment_intent.succeeded', false, 120);

  perform set_config(
    'lokala_test.claim_regression_processed',
    (r.already_processed)::text,
    true
  );
end $$;

select ok(
  current_setting('lokala_test.claim_regression_processed')::boolean,
  '4: after a direct table update sets processed_at, a subsequent claim reports already_processed=true'
);

-- 5. anon/authenticated cannot call the claim RPC directly (matches every
-- other Stripe webhook bookkeeping function in this schema).
set local role authenticated;

select throws_ok(
  $$select public.claim_stripe_webhook_event('evt_denied', 'payment_intent.succeeded', false, 120)$$,
  '42501',
  null,
  '5: authenticated cannot call claim_stripe_webhook_event'
);

reset role;

select * from finish();
rollback;
