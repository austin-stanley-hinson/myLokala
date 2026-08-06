-- Atomic webhook event claim with retry-safe unfinished state.
--
-- Problem fixed: insert-then-ack-on-conflict treated every retry of a failed
-- delivery as a completed duplicate, permanently dropping the event even when
-- processed_at was still null.
--
-- New state machine (per stripe_event_id):
--   claimed / processing  → locked_at set, processed_at null
--   completed             → processed_at set (retries return already_processed)
--   failed / unlocked     → processed_at null, locked_at null (retry may reclaim)
--   in_progress (lease)   → processed_at null, locked_at recent (other workers wait)

alter table public.stripe_webhook_events
  add column if not exists locked_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

comment on column public.stripe_webhook_events.locked_at is
  'Set while a worker owns processing. Cleared on failure; left until processed_at on success. Stale leases may be reclaimed.';

comment on column public.stripe_webhook_events.attempt_count is
  'Number of times this event was successfully claimed for processing (including retries).';

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
set search_path = public
as $$
declare
  v_attempt integer;
  v_processed_at timestamptz;
  v_locked_at timestamptz;
  v_lease interval;
begin
  if p_stripe_event_id is null or length(trim(p_stripe_event_id)) = 0 then
    raise exception 'stripe_event_id required';
  end if;

  v_lease := make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 1));

  -- First delivery inserts a locked row. Retries of unfinished events reclaim
  -- only when the prior lease is absent or expired. Completed rows never update.
  insert into public.stripe_webhook_events as e (
    stripe_event_id,
    event_type,
    livemode,
    locked_at,
    attempt_count,
    process_error
  )
  values (
    p_stripe_event_id,
    p_event_type,
    p_livemode,
    now(),
    1,
    null
  )
  on conflict (stripe_event_id) do update
  set
    locked_at = now(),
    attempt_count = e.attempt_count + 1,
    process_error = null
  where e.processed_at is null
    and (
      e.locked_at is null
      or e.locked_at < now() - v_lease
    )
  returning e.attempt_count into v_attempt;

  if found then
    claimed := true;
    already_processed := false;
    attempt_count := v_attempt;
    return next;
    return;
  end if;

  select e.processed_at, e.locked_at, e.attempt_count
    into v_processed_at, v_locked_at, v_attempt
  from public.stripe_webhook_events e
  where e.stripe_event_id = p_stripe_event_id;

  if not found then
    -- Extremely unlikely race (row deleted between statements).
    raise exception 'webhook event row missing after claim conflict';
  end if;

  if v_processed_at is not null then
    claimed := false;
    already_processed := true;
    attempt_count := v_attempt;
    return next;
    return;
  end if;

  -- Unfinished, but another worker holds a fresh lease.
  claimed := false;
  already_processed := false;
  attempt_count := v_attempt;
  return next;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, boolean, integer)
  from public;
revoke all on function public.claim_stripe_webhook_event(text, text, boolean, integer)
  from anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text, boolean, integer)
  to service_role;
