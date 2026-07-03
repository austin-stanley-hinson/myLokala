-- Track each business owner's Stripe Connect setup so the dashboard can reflect
-- payment readiness (whether they can accept charges / receive payouts) before
-- selling paid gift certificates.
--
-- This checkpoint is schema-only: no Stripe API calls, checkout, transfers,
-- payouts, or webhooks are wired up yet. The table is additive and does not
-- touch existing tables, so it is safe to apply independently.

create table if not exists public.business_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  -- One payment account per owner (unique below); cascades if the user is deleted.
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Stripe's connected account id (acct_...). Nullable until onboarding starts.
  stripe_account_id text unique,
  onboarding_status text not null default 'not_started',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One payment account row per business owner.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_payment_accounts_owner_id_key'
      and conrelid = 'public.business_payment_accounts'::regclass
  ) then
    alter table public.business_payment_accounts
      add constraint business_payment_accounts_owner_id_key unique (owner_id);
  end if;
end
$$;

-- Constrain onboarding_status to the supported lifecycle states.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_payment_accounts_onboarding_status_check'
      and conrelid = 'public.business_payment_accounts'::regclass
  ) then
    alter table public.business_payment_accounts
      add constraint business_payment_accounts_onboarding_status_check
      check (onboarding_status in ('not_started', 'pending', 'complete', 'restricted'));
  end if;
end
$$;

-- Keep updated_at current on every change. The trigger function is created
-- idempotently so this migration can be re-run safely.
create or replace function public.set_business_payment_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_business_payment_accounts_updated_at
  on public.business_payment_accounts;
create trigger set_business_payment_accounts_updated_at
  before update on public.business_payment_accounts
  for each row
  execute function public.set_business_payment_accounts_updated_at();

-- Row level security: an owner may only read/create/update their own row and
-- can never see another owner's payment account.
alter table public.business_payment_accounts enable row level security;

drop policy if exists "Owners can read own payment account"
  on public.business_payment_accounts;
create policy "Owners can read own payment account"
on public.business_payment_accounts
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Owners can insert own payment account"
  on public.business_payment_accounts;
create policy "Owners can insert own payment account"
on public.business_payment_accounts
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Owners can update own payment account"
  on public.business_payment_accounts;
create policy "Owners can update own payment account"
on public.business_payment_accounts
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
