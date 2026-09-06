-- Stripe payment attempts, webhook events, refunds, and disputes (private).

create table app_private.stripe_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null
    references public.payment_orders (id) on delete restrict,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  livemode boolean not null,
  status text not null default 'created'
    check (status in (
      'created', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled'
    )),
  idempotency_key text not null unique,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index stripe_payment_attempts_order_idx
  on app_private.stripe_payment_attempts (payment_order_id);

create unique index stripe_payment_attempts_pi_uidx
  on app_private.stripe_payment_attempts (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create trigger stripe_payment_attempts_set_updated_at
  before update on app_private.stripe_payment_attempts
  for each row execute function public.set_updated_at();

create trigger stripe_payment_attempts_forbid_delete
  before delete on app_private.stripe_payment_attempts
  for each row execute function public.forbid_hard_delete();

create table app_private.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  object_id text,
  livemode boolean not null,
  processing_status text not null default 'received'
    check (processing_status in (
      'received', 'processing', 'completed', 'failed', 'ignored'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  payload_fingerprint text,
  received_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index stripe_webhook_events_status_idx
  on app_private.stripe_webhook_events (processing_status, received_at);

create trigger stripe_webhook_events_set_updated_at
  before update on app_private.stripe_webhook_events
  for each row execute function public.set_updated_at();

create trigger stripe_webhook_events_forbid_delete
  before delete on app_private.stripe_webhook_events
  for each row execute function public.forbid_hard_delete();

-- Claim-and-retry lease pattern (service role)
create or replace function app_private.claim_stripe_webhook_event(
  p_stripe_event_id text,
  p_event_type text,
  p_object_id text,
  p_livemode boolean,
  p_lease_seconds integer default 300
)
returns table (
  event_id uuid,
  claim_status text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = app_private, pg_temp
as $$
declare
  v_row app_private.stripe_webhook_events%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  insert into app_private.stripe_webhook_events (
    stripe_event_id,
    event_type,
    object_id,
    livemode,
    processing_status,
    attempt_count,
    locked_at
  ) values (
    p_stripe_event_id,
    p_event_type,
    p_object_id,
    p_livemode,
    'processing',
    1,
    v_now
  )
  on conflict (stripe_event_id) do nothing;

  select * into v_row
  from app_private.stripe_webhook_events
  where stripe_event_id = p_stripe_event_id
  for update;

  if v_row.processing_status = 'completed' then
    event_id := v_row.id;
    claim_status := 'already_completed';
    attempt_count := v_row.attempt_count;
    return next;
    return;
  end if;

  if v_row.processing_status = 'processing'
     and v_row.locked_at is not null
     and v_row.locked_at > v_now - make_interval(secs => p_lease_seconds)
     and v_row.locked_at <> v_now then
    event_id := v_row.id;
    claim_status := 'in_progress';
    attempt_count := v_row.attempt_count;
    return next;
    return;
  end if;

  update app_private.stripe_webhook_events
  set processing_status = 'processing',
      attempt_count = v_row.attempt_count + case when v_row.locked_at = v_now then 0 else 1 end,
      locked_at = v_now,
      last_error = null,
      updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  event_id := v_row.id;
  claim_status := 'claimed';
  attempt_count := v_row.attempt_count;
  return next;
end;
$$;

create or replace function app_private.complete_stripe_webhook_event(
  p_stripe_event_id text,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = app_private, pg_temp
as $$
begin
  update app_private.stripe_webhook_events
  set processing_status = case when p_success then 'completed' else 'failed' end,
      processed_at = case when p_success then timezone('utc', now()) else processed_at end,
      locked_at = null,
      last_error = case when p_success then null else p_error end,
      updated_at = timezone('utc', now())
  where stripe_event_id = p_stripe_event_id;
end;
$$;

revoke all on function app_private.claim_stripe_webhook_event(text, text, text, boolean, integer) from public;
revoke all on function app_private.complete_stripe_webhook_event(text, boolean, text) from public;
grant execute on function app_private.claim_stripe_webhook_event(text, text, text, boolean, integer) to service_role;
grant execute on function app_private.complete_stripe_webhook_event(text, boolean, text) to service_role;

-- Minimal refund / dispute scaffolding
create table app_private.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid references public.payment_orders (id) on delete restrict,
  balance_purchase_id uuid references public.balance_purchases (id) on delete restrict,
  balance_redemption_id uuid references public.balance_redemptions (id) on delete restrict,
  stripe_refund_id text unique,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger refunds_set_updated_at
  before update on app_private.refunds
  for each row execute function public.set_updated_at();

create trigger refunds_forbid_delete
  before delete on app_private.refunds
  for each row execute function public.forbid_hard_delete();

create table app_private.stripe_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid references public.payment_orders (id) on delete restrict,
  balance_purchase_id uuid references public.balance_purchases (id) on delete restrict,
  stripe_dispute_id text not null unique,
  stripe_charge_id text,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'needs_response'
    check (status in (
      'needs_response', 'under_review', 'won', 'lost', 'warning_closed', 'charge_refunded'
    )),
  reason text,
  evidence_due_by timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger stripe_disputes_set_updated_at
  before update on app_private.stripe_disputes
  for each row execute function public.set_updated_at();

create trigger stripe_disputes_forbid_delete
  before delete on app_private.stripe_disputes
  for each row execute function public.forbid_hard_delete();
