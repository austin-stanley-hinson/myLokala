-- Distinguish business owners from customers by extending the existing
-- `profiles` table rather than introducing a new table. This keeps the
-- account model in one place and avoids a join for the common case of
-- "what kind of account is this user?".
--
-- Fields are additive and nullable (except account_type, which defaults to
-- 'customer') so existing rows remain valid without a backfill.

alter table public.profiles
  add column if not exists account_type text not null default 'customer',
  add column if not exists business_name text,
  add column if not exists business_address text,
  add column if not exists business_phone text,
  add column if not exists business_website text;

-- Constrain account_type to the supported roles. Added idempotently so the
-- migration can be re-run safely.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('customer', 'business_owner'));
  end if;
end
$$;

-- Ensure RLS is on and users can only read/update their own profile row,
-- which includes the new business fields. Policies are dropped first so this
-- migration is idempotent and converges existing policy definitions.
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
