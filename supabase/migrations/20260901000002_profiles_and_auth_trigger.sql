-- Profiles and auth bootstrap (profile + USD wallet). Wallet table is created
-- here in minimal form; remaining wallet constraints arrive with purchases.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is
  'User profile. Membership (not profile metadata) authorizes merchant access.';

-- Wallets (core identity created with the user; financial writes via functions only)
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  currency text not null default 'USD' check (currency = 'USD'),
  balance_cents bigint not null default 0
    check (balance_cents >= 0),
  status text not null default 'active'
    check (status in ('active', 'frozen', 'closed')),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, currency)
);

create index wallets_user_id_idx on public.wallets (user_id);

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

comment on table public.wallets is
  'Cached customer wallet balance. Clients may read; only trusted functions may write balance.';

-- Idempotent signup bootstrap: profile + USD wallet. Does not trust raw_user_meta_data
-- for financial or merchant authorization.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display text;
begin
  v_display := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  insert into public.profiles (id, display_name, status)
  values (new.id, v_display, 'active')
  on conflict (id) do nothing;

  insert into public.wallets (user_id, currency, balance_cents, status, version)
  values (new.id, 'USD', 0, 'active', 0)
  on conflict (user_id, currency) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
