-- Stripe Connect onboarding (gift-balance payout rail).
-- Express + hosted Account Links. Transfers-first readiness. Durable
-- accounts.create reservation so concurrent onboarding cannot mint a second
-- connected account after Stripe's 24-hour idempotency window.

-- ---------------------------------------------------------------------------
-- Connected-account columns (transfer-first). Rename requirements_due rather
-- than keeping a duplicate currently-due column.
-- ---------------------------------------------------------------------------
alter table app_private.stripe_connected_accounts
  rename column requirements_due to requirements_currently_due;

alter table app_private.stripe_connected_accounts
  add column transfers_enabled boolean not null default false,
  add column disabled_reason text,
  add column requirements_past_due jsonb not null default '[]'::jsonb,
  add column requirements_eventually_due jsonb not null default '[]'::jsonb;

alter table app_private.stripe_connected_accounts
  add constraint stripe_connected_accounts_currently_due_is_array
    check (jsonb_typeof(requirements_currently_due) = 'array'),
  add constraint stripe_connected_accounts_past_due_is_array
    check (jsonb_typeof(requirements_past_due) = 'array'),
  add constraint stripe_connected_accounts_eventually_due_is_array
    check (jsonb_typeof(requirements_eventually_due) = 'array');

comment on column app_private.stripe_connected_accounts.charges_enabled is
  'Diagnostic only. Never used for Lokala settlement readiness.';
comment on column app_private.stripe_connected_accounts.transfers_enabled is
  'True when Stripe capabilities.transfers is active. Required for settlements.';

-- ---------------------------------------------------------------------------
-- Durable accounts.create reservation (one per merchant + livemode)
-- ---------------------------------------------------------------------------
create table app_private.stripe_connect_account_reservations (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id uuid not null
    references public.merchant_accounts (id) on delete cascade,
  livemode boolean not null,
  stripe_idempotency_key text not null,
  stripe_account_id text,
  status text not null default 'open'
    check (status in ('open', 'finalized', 'recovery_required')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_account_id, livemode),
  unique (stripe_idempotency_key)
);

create trigger stripe_connect_account_reservations_set_updated_at
  before update on app_private.stripe_connect_account_reservations
  for each row execute function public.set_updated_at();

alter table app_private.stripe_connect_account_reservations enable row level security;

comment on table app_private.stripe_connect_account_reservations is
  'Durable Stripe accounts.create reservation. Idempotency keys are never exposed to clients. Stale open reservations beyond 24 hours require recovery and must not mint a new key.';

-- Stripe documented idempotency-key window.
create or replace function app_private.stripe_idempotency_window()
returns interval
language sql
immutable
as $$
  select interval '24 hours';
$$;

revoke all on function app_private.stripe_idempotency_window() from public;
grant execute on function app_private.stripe_idempotency_window() to service_role;

create or replace function app_private.jsonb_text_array_is_empty(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(coalesce(p_value, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(p_value, '[]'::jsonb)) = 0;
$$;

revoke all on function app_private.jsonb_text_array_is_empty(jsonb) from public;
grant execute on function app_private.jsonb_text_array_is_empty(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Readiness: payouts + transfers. charges_enabled is ignored.
-- ---------------------------------------------------------------------------
create or replace function app_private.merchant_connect_is_ready(
  p_merchant_account_id uuid,
  p_stripe_livemode boolean
)
returns boolean
language sql
stable
security definer
set search_path = app_private, pg_temp
as $$
  select exists (
    select 1
    from app_private.stripe_connected_accounts c
    where c.merchant_account_id = p_merchant_account_id
      and c.livemode = p_stripe_livemode
      and c.onboarding_status = 'complete'
      and c.details_submitted
      and c.payouts_enabled
      and c.transfers_enabled
      and c.disabled_reason is null
      and jsonb_typeof(c.requirements_currently_due) = 'array'
      and jsonb_array_length(c.requirements_currently_due) = 0
      and jsonb_typeof(c.requirements_past_due) = 'array'
      and jsonb_array_length(c.requirements_past_due) = 0
  );
$$;

revoke all on function app_private.merchant_connect_is_ready(uuid, boolean) from public;
grant execute on function app_private.merchant_connect_is_ready(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Authenticated status RPC (safe fields only)
-- ---------------------------------------------------------------------------
create or replace function public.get_merchant_connect_status(
  p_merchant_account_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_platform_live boolean;
  v_row app_private.stripe_connected_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_merchant_account_id is null then
    raise exception 'merchant_account_id is required';
  end if;

  if not public.is_merchant_member(
    p_merchant_account_id,
    array['owner', 'admin', 'staff']
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select stripe_livemode into v_platform_live
  from app_private.platform_config
  where id = 'mvp';

  if v_platform_live is null then
    raise exception 'Platform is not configured';
  end if;

  select * into v_row
  from app_private.stripe_connected_accounts
  where merchant_account_id = p_merchant_account_id
    and livemode = v_platform_live;

  if not found then
    return jsonb_build_object(
      'onboarding_status', 'not_started',
      'has_connected_account', false,
      'payouts_enabled', false,
      'transfers_enabled', false,
      'details_submitted', false,
      'charges_enabled', false,
      'livemode', v_platform_live,
      'livemode_matches', true,
      'disabled_reason', null,
      'requirements_currently_due', '[]'::jsonb,
      'requirements_past_due', '[]'::jsonb,
      'requirements_eventually_due', '[]'::jsonb,
      'ready_for_settlement', false
    );
  end if;

  return jsonb_build_object(
    'onboarding_status', v_row.onboarding_status,
    'has_connected_account', true,
    'payouts_enabled', v_row.payouts_enabled,
    'transfers_enabled', v_row.transfers_enabled,
    'details_submitted', v_row.details_submitted,
    'charges_enabled', v_row.charges_enabled,
    'livemode', v_row.livemode,
    'livemode_matches', v_row.livemode = v_platform_live,
    'disabled_reason', v_row.disabled_reason,
    'requirements_currently_due', v_row.requirements_currently_due,
    'requirements_past_due', v_row.requirements_past_due,
    'requirements_eventually_due', v_row.requirements_eventually_due,
    'ready_for_settlement', app_private.merchant_connect_is_ready(
      p_merchant_account_id,
      v_platform_live
    )
  );
end;
$$;

revoke all on function public.get_merchant_connect_status(uuid) from public, anon;
grant execute on function public.get_merchant_connect_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Service-only: platform livemode
-- ---------------------------------------------------------------------------
create or replace function public.service_get_platform_stripe_livemode()
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_temp
as $$
declare
  v_live boolean;
begin
  select stripe_livemode into v_live
  from app_private.platform_config
  where id = 'mvp';

  if v_live is null then
    raise exception 'Platform is not configured';
  end if;

  return v_live;
end;
$$;

revoke all on function public.service_get_platform_stripe_livemode() from public, anon, authenticated;
grant execute on function public.service_get_platform_stripe_livemode() to service_role;

-- ---------------------------------------------------------------------------
-- Service-only: read current-mode connected account id (never granted to clients)
-- ---------------------------------------------------------------------------
create or replace function public.service_get_stripe_connected_account(
  p_merchant_account_id uuid,
  p_livemode boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, pg_temp
as $$
declare
  v_account_id text;
begin
  if p_merchant_account_id is null then
    raise exception 'merchant_account_id is required';
  end if;

  select stripe_account_id into v_account_id
  from app_private.stripe_connected_accounts
  where merchant_account_id = p_merchant_account_id
    and livemode = p_livemode;

  return jsonb_build_object('stripe_account_id', v_account_id);
end;
$$;

revoke all on function public.service_get_stripe_connected_account(uuid, boolean) from public, anon, authenticated;
grant execute on function public.service_get_stripe_connected_account(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Service-only: acquire or reuse accounts.create reservation
-- ---------------------------------------------------------------------------
create or replace function app_private.reserve_stripe_connect_account(
  p_merchant_account_id uuid,
  p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_account_id text;
  v_res app_private.stripe_connect_account_reservations%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if p_merchant_account_id is null then
    raise exception 'merchant_account_id is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'lokala.stripe_connect_reserve:'
        || p_merchant_account_id::text
        || ':'
        || p_livemode::text,
      0
    )
  );

  if not exists (
    select 1 from public.merchant_accounts where id = p_merchant_account_id
  ) then
    raise exception 'Merchant not found';
  end if;

  select stripe_account_id into v_account_id
  from app_private.stripe_connected_accounts
  where merchant_account_id = p_merchant_account_id
    and livemode = p_livemode;

  if v_account_id is not null then
    return jsonb_build_object(
      'outcome', 'already_connected',
      'stripe_account_id', v_account_id,
      'idempotency_key', null
    );
  end if;

  select * into v_res
  from app_private.stripe_connect_account_reservations
  where merchant_account_id = p_merchant_account_id
    and livemode = p_livemode
  for update;

  if found then
    if v_res.status = 'finalized' then
      -- Reservation says finalized but no connected-account row: recovery.
      return jsonb_build_object(
        'outcome', 'recovery_required',
        'stripe_account_id', null,
        'idempotency_key', null
      );
    end if;

    if v_res.status = 'recovery_required'
       or v_res.created_at <= v_now - app_private.stripe_idempotency_window() then
      if v_res.status is distinct from 'recovery_required' then
        update app_private.stripe_connect_account_reservations
        set status = 'recovery_required'
        where id = v_res.id;
      end if;

      return jsonb_build_object(
        'outcome', 'recovery_required',
        'stripe_account_id', null,
        'idempotency_key', null
      );
    end if;

    return jsonb_build_object(
      'outcome', 'needs_create',
      'stripe_account_id', null,
      'idempotency_key', v_res.stripe_idempotency_key
    );
  end if;

  insert into app_private.stripe_connect_account_reservations (
    merchant_account_id,
    livemode,
    stripe_idempotency_key,
    status
  ) values (
    p_merchant_account_id,
    p_livemode,
    'lokala_connect_' || replace(gen_random_uuid()::text, '-', ''),
    'open'
  )
  returning * into v_res;

  return jsonb_build_object(
    'outcome', 'needs_create',
    'stripe_account_id', null,
    'idempotency_key', v_res.stripe_idempotency_key
  );
end;
$$;

revoke all on function app_private.reserve_stripe_connect_account(uuid, boolean) from public;
grant execute on function app_private.reserve_stripe_connect_account(uuid, boolean) to service_role;

create or replace function public.service_reserve_stripe_connect_account(
  p_merchant_account_id uuid,
  p_livemode boolean
)
returns jsonb
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.reserve_stripe_connect_account(
    p_merchant_account_id,
    p_livemode
  );
$$;

revoke all on function public.service_reserve_stripe_connect_account(uuid, boolean) from public, anon, authenticated;
grant execute on function public.service_reserve_stripe_connect_account(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Service-only: finalize connected-account row from a successful Stripe create
-- ---------------------------------------------------------------------------
create or replace function app_private.finalize_stripe_connected_account(
  p_merchant_account_id uuid,
  p_livemode boolean,
  p_stripe_account_id text,
  p_onboarding_status text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_transfers_enabled boolean,
  p_details_submitted boolean,
  p_disabled_reason text,
  p_requirements_currently_due jsonb,
  p_requirements_past_due jsonb,
  p_requirements_eventually_due jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_res app_private.stripe_connect_account_reservations%rowtype;
  v_account_id text := nullif(trim(p_stripe_account_id), '');
  v_existing_id text;
  v_status text := coalesce(p_onboarding_status, 'pending');
begin
  if p_merchant_account_id is null then
    raise exception 'merchant_account_id is required';
  end if;

  if v_account_id is null then
    raise exception 'stripe_account_id is required';
  end if;

  if v_status not in ('not_started', 'pending', 'restricted', 'complete', 'disabled') then
    raise exception 'Invalid onboarding_status';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'lokala.stripe_connect_reserve:'
        || p_merchant_account_id::text
        || ':'
        || p_livemode::text,
      0
    )
  );

  select stripe_account_id into v_existing_id
  from app_private.stripe_connected_accounts
  where merchant_account_id = p_merchant_account_id
    and livemode = p_livemode;

  if v_existing_id is not null then
    if v_existing_id is distinct from v_account_id then
      raise exception 'Connected account already exists for this merchant and mode';
    end if;

    update app_private.stripe_connect_account_reservations
    set status = 'finalized',
        stripe_account_id = v_account_id
    where merchant_account_id = p_merchant_account_id
      and livemode = p_livemode
      and status is distinct from 'recovery_required';

    return jsonb_build_object(
      'finalized', true,
      'idempotent', true,
      'stripe_account_id', v_existing_id
    );
  end if;

  select * into v_res
  from app_private.stripe_connect_account_reservations
  where merchant_account_id = p_merchant_account_id
    and livemode = p_livemode
  for update;

  if not found or v_res.status = 'recovery_required' then
    raise exception 'Connect reservation is not available';
  end if;

  insert into app_private.stripe_connected_accounts (
    merchant_account_id,
    stripe_account_id,
    livemode,
    onboarding_status,
    charges_enabled,
    payouts_enabled,
    transfers_enabled,
    details_submitted,
    disabled_reason,
    requirements_currently_due,
    requirements_past_due,
    requirements_eventually_due,
    last_synced_at
  ) values (
    p_merchant_account_id,
    v_account_id,
    p_livemode,
    v_status,
    coalesce(p_charges_enabled, false),
    coalesce(p_payouts_enabled, false),
    coalesce(p_transfers_enabled, false),
    coalesce(p_details_submitted, false),
    nullif(trim(p_disabled_reason), ''),
    coalesce(p_requirements_currently_due, '[]'::jsonb),
    coalesce(p_requirements_past_due, '[]'::jsonb),
    coalesce(p_requirements_eventually_due, '[]'::jsonb),
    timezone('utc', now())
  );

  update app_private.stripe_connect_account_reservations
  set status = 'finalized',
      stripe_account_id = v_account_id
  where id = v_res.id;

  return jsonb_build_object(
    'finalized', true,
    'idempotent', false,
    'stripe_account_id', v_account_id
  );
end;
$$;

revoke all on function app_private.finalize_stripe_connected_account(
  uuid, boolean, text, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb
) from public;
grant execute on function app_private.finalize_stripe_connected_account(
  uuid, boolean, text, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb
) to service_role;

create or replace function public.service_finalize_stripe_connected_account(
  p_merchant_account_id uuid,
  p_livemode boolean,
  p_stripe_account_id text,
  p_onboarding_status text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_transfers_enabled boolean,
  p_details_submitted boolean,
  p_disabled_reason text,
  p_requirements_currently_due jsonb,
  p_requirements_past_due jsonb,
  p_requirements_eventually_due jsonb
)
returns jsonb
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.finalize_stripe_connected_account(
    p_merchant_account_id,
    p_livemode,
    p_stripe_account_id,
    p_onboarding_status,
    p_charges_enabled,
    p_payouts_enabled,
    p_transfers_enabled,
    p_details_submitted,
    p_disabled_reason,
    p_requirements_currently_due,
    p_requirements_past_due,
    p_requirements_eventually_due
  );
$$;

revoke all on function public.service_finalize_stripe_connected_account(
  uuid, boolean, text, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.service_finalize_stripe_connected_account(
  uuid, boolean, text, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Service-only: synchronize an existing connected account (webhook / return)
-- Never inserts. Matches stripe_account_id + livemode.
-- ---------------------------------------------------------------------------
create or replace function app_private.sync_stripe_connected_account(
  p_stripe_account_id text,
  p_livemode boolean,
  p_onboarding_status text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_transfers_enabled boolean,
  p_details_submitted boolean,
  p_disabled_reason text,
  p_requirements_currently_due jsonb,
  p_requirements_past_due jsonb,
  p_requirements_eventually_due jsonb,
  p_last_stripe_event_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, pg_temp
as $$
declare
  v_id uuid;
  v_status text := coalesce(p_onboarding_status, 'pending');
begin
  if nullif(trim(p_stripe_account_id), '') is null then
    raise exception 'stripe_account_id is required';
  end if;

  if v_status not in ('not_started', 'pending', 'restricted', 'complete', 'disabled') then
    raise exception 'Invalid onboarding_status';
  end if;

  update app_private.stripe_connected_accounts
  set onboarding_status = v_status,
      charges_enabled = coalesce(p_charges_enabled, charges_enabled),
      payouts_enabled = coalesce(p_payouts_enabled, payouts_enabled),
      transfers_enabled = coalesce(p_transfers_enabled, transfers_enabled),
      details_submitted = coalesce(p_details_submitted, details_submitted),
      disabled_reason = nullif(trim(p_disabled_reason), ''),
      requirements_currently_due = coalesce(p_requirements_currently_due, requirements_currently_due),
      requirements_past_due = coalesce(p_requirements_past_due, requirements_past_due),
      requirements_eventually_due = coalesce(p_requirements_eventually_due, requirements_eventually_due),
      last_synced_at = timezone('utc', now()),
      last_stripe_event_at = coalesce(p_last_stripe_event_at, last_stripe_event_at)
  where stripe_account_id = p_stripe_account_id
    and livemode = p_livemode
  returning id into v_id;

  return jsonb_build_object('matched', v_id is not null);
end;
$$;

revoke all on function app_private.sync_stripe_connected_account(
  text, boolean, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb, timestamptz
) from public;
grant execute on function app_private.sync_stripe_connected_account(
  text, boolean, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb, timestamptz
) to service_role;

create or replace function public.service_sync_stripe_connected_account(
  p_stripe_account_id text,
  p_livemode boolean,
  p_onboarding_status text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_transfers_enabled boolean,
  p_details_submitted boolean,
  p_disabled_reason text,
  p_requirements_currently_due jsonb,
  p_requirements_past_due jsonb,
  p_requirements_eventually_due jsonb,
  p_last_stripe_event_at timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.sync_stripe_connected_account(
    p_stripe_account_id,
    p_livemode,
    p_onboarding_status,
    p_charges_enabled,
    p_payouts_enabled,
    p_transfers_enabled,
    p_details_submitted,
    p_disabled_reason,
    p_requirements_currently_due,
    p_requirements_past_due,
    p_requirements_eventually_due,
    p_last_stripe_event_at
  );
$$;

revoke all on function public.service_sync_stripe_connected_account(
  text, boolean, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.service_sync_stripe_connected_account(
  text, boolean, text, boolean, boolean, boolean, boolean, text, jsonb, jsonb, jsonb, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- Service-only webhook claim/complete wrappers (match app_private signatures)
-- ---------------------------------------------------------------------------
create or replace function public.service_claim_stripe_webhook_event(
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
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select *
  from app_private.claim_stripe_webhook_event(
    p_stripe_event_id,
    p_event_type,
    p_object_id,
    p_livemode,
    p_lease_seconds
  );
$$;

create or replace function public.service_complete_stripe_webhook_event(
  p_stripe_event_id text,
  p_success boolean,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.complete_stripe_webhook_event(
    p_stripe_event_id,
    p_success,
    p_error
  );
$$;

revoke all on function public.service_claim_stripe_webhook_event(text, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.service_complete_stripe_webhook_event(text, boolean, text) from public, anon, authenticated;
grant execute on function public.service_claim_stripe_webhook_event(text, text, text, boolean, integer) to service_role;
grant execute on function public.service_complete_stripe_webhook_event(text, boolean, text) to service_role;
