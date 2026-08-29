-- Merchant accounts, members, locations, payment hubs, Connect status.

create table public.merchant_accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) > 0),
  legal_name text,
  description text,
  support_email text,
  support_phone text,
  website_url text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'active', 'suspended', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger merchant_accounts_set_updated_at
  before update on public.merchant_accounts
  for each row execute function public.set_updated_at();

create table public.merchant_members (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id uuid not null references public.merchant_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_account_id, user_id)
);

create index merchant_members_user_id_idx on public.merchant_members (user_id);
create index merchant_members_merchant_idx on public.merchant_members (merchant_account_id);

create trigger merchant_members_set_updated_at
  before update on public.merchant_members
  for each row execute function public.set_updated_at();

create table public.merchant_locations (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id uuid not null references public.merchant_accounts (id) on delete cascade,
  label text not null,
  address_text text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text default 'US',
  latitude double precision
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  longitude double precision
    check (longitude is null or (longitude >= -180 and longitude <= 180)),
  timezone text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index merchant_locations_merchant_idx
  on public.merchant_locations (merchant_account_id);

create trigger merchant_locations_set_updated_at
  before update on public.merchant_locations
  for each row execute function public.set_updated_at();

-- Permanent payment hubs (QR codes use public_code, never merchant UUIDs)
create table public.payment_hubs (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id uuid not null references public.merchant_accounts (id) on delete cascade,
  merchant_location_id uuid references public.merchant_locations (id) on delete set null,
  public_code text not null unique,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'rotated')),
  rotated_from_id uuid references public.payment_hubs (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  disabled_at timestamptz,
  check (
    (status = 'disabled' and disabled_at is not null)
    or (status <> 'disabled')
  )
);

create index payment_hubs_merchant_idx on public.payment_hubs (merchant_account_id);

create or replace function public.generate_payment_hub_public_code()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  candidate text;
  attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'Unable to generate unique payment hub public_code';
    end if;
    -- 22-char url-safe token from 16 random bytes
    candidate := translate(
      rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='),
      '+/',
      '-_'
    );
    exit when not exists (
      select 1 from public.payment_hubs h where h.public_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_payment_hub_public_code() from public;
grant execute on function public.generate_payment_hub_public_code() to service_role;

create or replace function public.payment_hubs_set_public_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.public_code is null or length(trim(new.public_code)) = 0 then
    new.public_code := public.generate_payment_hub_public_code();
  end if;
  return new;
end;
$$;

create trigger payment_hubs_assign_public_code
  before insert on public.payment_hubs
  for each row execute function public.payment_hubs_set_public_code();

-- Stripe Connect readiness (private — no Data API exposure)
create table app_private.stripe_connected_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id uuid not null references public.merchant_accounts (id) on delete cascade,
  stripe_account_id text not null,
  livemode boolean not null,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in (
      'not_started', 'pending', 'restricted', 'complete', 'disabled'
    )),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  last_stripe_event_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_account_id, livemode),
  unique (stripe_account_id)
);

create trigger stripe_connected_accounts_set_updated_at
  before update on app_private.stripe_connected_accounts
  for each row execute function public.set_updated_at();

-- Membership helpers used by RLS and functions
create or replace function public.is_merchant_member(
  p_merchant_account_id uuid,
  p_roles text[] default array['owner', 'admin', 'staff']
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.merchant_members m
    where m.merchant_account_id = p_merchant_account_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.is_merchant_member(uuid, text[]) from public;
grant execute on function public.is_merchant_member(uuid, text[]) to authenticated, service_role;

-- Safe payment-hub resolver for mobile (minimal public fields only)
create or replace function public.resolve_payment_hub(p_public_code text)
returns table (
  payment_hub_id uuid,
  public_code text,
  merchant_account_id uuid,
  merchant_display_name text,
  merchant_location_id uuid,
  location_label text,
  currency text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_public_code is null or length(trim(p_public_code)) = 0 then
    return;
  end if;

  return query
  select
    h.id,
    h.public_code,
    h.merchant_account_id,
    ma.display_name,
    h.merchant_location_id,
    ml.label,
    'USD'::text
  from public.payment_hubs h
  join public.merchant_accounts ma on ma.id = h.merchant_account_id
  left join public.merchant_locations ml on ml.id = h.merchant_location_id
  where h.public_code = trim(p_public_code)
    and h.status = 'active'
    and ma.status = 'active';
end;
$$;

revoke all on function public.resolve_payment_hub(text) from public;
grant execute on function public.resolve_payment_hub(text) to anon, authenticated, service_role;
