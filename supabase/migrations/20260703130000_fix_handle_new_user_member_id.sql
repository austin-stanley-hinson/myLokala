-- Fix "Database error saving new user" on signup.
--
-- public.profiles.member_id is NOT NULL with no default, but the new-user
-- trigger function did not insert member_id, so every signup failed. A remote
-- hotfix was applied manually; this migration records that fix cleanly in the
-- repo by re-defining public.handle_new_user() to always populate member_id.
--
-- member_id falls back to the auth user id (as text) when no member_id is
-- provided in metadata, guaranteeing the NOT NULL constraint is satisfied.
-- Additive (CREATE OR REPLACE); drops no data.

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
    member_id,
    account_type,
    business_name,
    business_address,
    business_phone,
    business_website
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'member_id', ''), new.id::text),
    coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'customer'),
    nullif(new.raw_user_meta_data->>'business_name', ''),
    nullif(new.raw_user_meta_data->>'business_address', ''),
    nullif(new.raw_user_meta_data->>'business_phone', ''),
    nullif(new.raw_user_meta_data->>'business_website', '')
  )
  -- If a row already exists (another trigger, replayed insert), promote
  -- account_type from metadata and backfill only the fields still empty so we
  -- never clobber values the app/merchant already set.
  on conflict (id) do update set
    account_type = coalesce(
      nullif(new.raw_user_meta_data->>'account_type', ''),
      public.profiles.account_type
    ),
    member_id = coalesce(
      public.profiles.member_id,
      nullif(new.raw_user_meta_data->>'member_id', ''),
      new.id::text
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
