-- Fix: the legacy platform-webhook claim (src/lib/payments/webhook-claim.ts)
-- has never had a matching migration. Every webhook delivery -- legacy
-- gift-certificate AND the new balance-purchase branch, since both sit
-- behind the same top-level claim in src/app/api/stripe/webhook/route.ts --
-- 500s on a fresh database because public.claim_stripe_webhook_event and the
-- public.stripe_webhook_events table it operates on simply do not exist.
--
-- Investigated first, per the task: does service_claim_stripe_webhook_event /
-- service_complete_stripe_webhook_event (migration 20260901000013) already do
-- what the legacy path needs? No, on both counts:
--   1. Different return shape. app_private.claim_stripe_webhook_event (and its
--      service_* wrapper) returns `claim_status text` ('already_completed' |
--      'in_progress' | 'claimed'). webhook-claim.ts destructures
--      `row.claimed` / `row.already_processed` as BOOLEANS. Those fields do
--      not exist on that row -- a naive rename-only wrapper would leave both
--      always undefined/falsy, so every claim would silently fall through to
--      "in_progress" regardless of actual state. That is worse than the
--      current hard failure: a silent, wrong claim decision instead of a
--      loud one.
--   2. Different table, different columns. app_private.stripe_webhook_events
--      has no payment_transaction_id column and uses a processing_status
--      enum, not the processed_at/locked_at/process_error columns
--      markWebhookEventProcessed and releaseWebhookEventClaim update
--      DIRECTLY via `.from("stripe_webhook_events").update(...)` (not an
--      RPC call at all -- there is no "complete" RPC in the legacy path to
--      wrap). Pointing the claim at app_private's table would still leave
--      those direct table calls hitting a nonexistent public-schema table.
--
-- So this migration creates the actual missing public.stripe_webhook_events
-- table (shaped to exactly the columns webhook-claim.ts and route.ts already
-- read/write) and public.claim_stripe_webhook_event (shaped to exactly the
-- {claimed, already_processed, attempt_count} row it already destructures).
-- No public.complete_stripe_webhook_event is added -- nothing calls one.
-- webhook-claim.ts is unchanged: the function name/args/return shape it
-- already calls are matched exactly, not the other way around.
--
-- Scope note: this fixes the claim step, which is what was reported broken
-- and what gates every webhook delivery. It does not (and cannot, without
-- guessing at a schema this repo has no record of) recreate
-- payment_transactions / gift_certificates, which also have no migration in
-- this repo. Once claimed, a gift-certificate event whose payment_transaction
-- row cannot be found already acks cleanly via route.ts's existing
-- "no matching transaction" path (see the end-to-end test in this
-- checkpoint's report) -- that is unrelated to the claim bug and out of this
-- fix's stated scope.

create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  livemode boolean not null,
  -- No FK: public.payment_transactions has no migration in this repo either
  -- (a separate, pre-existing gap -- see the migration header above).
  payment_transaction_id uuid,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz,
  processed_at timestamptz,
  process_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index stripe_webhook_events_locked_idx
  on public.stripe_webhook_events (locked_at)
  where processed_at is null;

create trigger stripe_webhook_events_set_updated_at
  before update on public.stripe_webhook_events
  for each row execute function public.set_updated_at();

create trigger stripe_webhook_events_forbid_delete
  before delete on public.stripe_webhook_events
  for each row execute function public.forbid_hard_delete();

alter table public.stripe_webhook_events enable row level security;
-- No policies: service_role bypasses RLS; anon/authenticated get nothing,
-- matching every other Stripe webhook bookkeeping table in this schema.

-- markWebhookEventProcessed / releaseWebhookEventClaim (webhook-claim.ts)
-- update this table directly via the admin (service_role) PostgREST client,
-- not through a function -- so, unlike the SECURITY DEFINER function below,
-- service_role needs its own grant to do that.
grant select, update on public.stripe_webhook_events to service_role;

-- Claim-and-retry lease pattern, same algorithm as
-- app_private.claim_stripe_webhook_event (20260901000008), adapted to the
-- {claimed, already_processed, attempt_count} row shape and table
-- webhook-claim.ts already expects.
create or replace function public.claim_stripe_webhook_event(
  p_stripe_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_lease_seconds integer default 120
)
returns table (
  claimed boolean,
  already_processed boolean,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.stripe_webhook_events%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  insert into public.stripe_webhook_events (
    stripe_event_id,
    event_type,
    livemode,
    attempt_count,
    locked_at
  ) values (
    p_stripe_event_id,
    p_event_type,
    p_livemode,
    1,
    v_now
  )
  on conflict (stripe_event_id) do nothing;

  select * into v_row
  from public.stripe_webhook_events
  where stripe_event_id = p_stripe_event_id
  for update;

  if v_row.processed_at is not null then
    claimed := false;
    already_processed := true;
    attempt_count := v_row.attempt_count;
    return next;
    return;
  end if;

  if v_row.locked_at is not null
     and v_row.locked_at > v_now - make_interval(secs => p_lease_seconds)
     and v_row.locked_at <> v_now then
    claimed := false;
    already_processed := false;
    attempt_count := v_row.attempt_count;
    return next;
    return;
  end if;

  update public.stripe_webhook_events
  set attempt_count = v_row.attempt_count
        + case when v_row.locked_at = v_now then 0 else 1 end,
      locked_at = v_now
  where id = v_row.id
  returning * into v_row;

  claimed := true;
  already_processed := false;
  attempt_count := v_row.attempt_count;
  return next;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text, boolean, integer)
  to service_role;
