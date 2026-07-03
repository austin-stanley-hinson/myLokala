-- Create business-owner profiles correctly from auth metadata.
--
-- All accounts created through the Lokala web app are business owners; the web
-- signup writes account_type='business_owner' (plus business fields) into
-- auth.users.raw_user_meta_data. Customer accounts come from the mobile app and
-- carry no account_type (or 'customer').
--
-- The profile-creation trigger previously defaulted every new profile to
-- 'customer', so web business signups landed as customers. This migration:
--   1. Replaces the new-user trigger function so it derives account_type and
--      the business fields from auth metadata.
--   2. Repairs existing profiles that should be business owners.
-- It is additive (CREATE OR REPLACE + a scoped UPDATE) and drops no data.

-- 1. Trigger function: create the profile row from auth metadata. --------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    account_type,
    business_name,
    business_address,
    business_phone,
    business_website
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'customer'),
    nullif(new.raw_user_meta_data->>'business_name', ''),
    nullif(new.raw_user_meta_data->>'business_address', ''),
    nullif(new.raw_user_meta_data->>'business_phone', ''),
    nullif(new.raw_user_meta_data->>'business_website', '')
  )
  -- If a row already exists (another trigger, ret/replayed insert), promote
  -- account_type from metadata and backfill only the fields still empty so we
  -- never clobber values the app/merchant already set.
  on conflict (id) do update set
    account_type = coalesce(
      nullif(new.raw_user_meta_data->>'account_type', ''),
      public.profiles.account_type
    ),
    full_name = coalesce(
      public.profiles.full_name,
      nullif(new.raw_user_meta_data->>'full_name', '')
    ),
    business_name = coalesce(
      public.profiles.business_name,
      nullif(new.raw_user_meta_data->>'business_name', '')
    ),
    business_address = coalesce(
      public.profiles.business_address,
      nullif(new.raw_user_meta_data->>'business_address', '')
    ),
    business_phone = coalesce(
      public.profiles.business_phone,
      nullif(new.raw_user_meta_data->>'business_phone', '')
    ),
    business_website = coalesce(
      public.profiles.business_website,
      nullif(new.raw_user_meta_data->>'business_website', '')
    );

  return new;
end;
$$;

-- Ensure the trigger points at the function above (standard Supabase name).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 2. One-time repair for existing broken accounts. ----------------------------
-- Promote profiles whose auth metadata clearly says business_owner but whose
-- profile row is still customer/null. Business fields are backfilled from
-- metadata only when the profile field is currently null/empty, so any edited
-- values are preserved.
update public.profiles p
set
  account_type = 'business_owner',
  full_name = coalesce(
    nullif(p.full_name, ''),
    nullif(u.raw_user_meta_data->>'full_name', '')
  ),
  business_name = coalesce(
    nullif(p.business_name, ''),
    nullif(u.raw_user_meta_data->>'business_name', '')
  ),
  business_address = coalesce(
    nullif(p.business_address, ''),
    nullif(u.raw_user_meta_data->>'business_address', '')
  ),
  business_phone = coalesce(
    nullif(p.business_phone, ''),
    nullif(u.raw_user_meta_data->>'business_phone', '')
  ),
  business_website = coalesce(
    nullif(p.business_website, ''),
    nullif(u.raw_user_meta_data->>'business_website', '')
  )
from auth.users u
where u.id = p.id
  and u.raw_user_meta_data->>'account_type' = 'business_owner'
  and (p.account_type is null or p.account_type <> 'business_owner');
