-- Merchant onboarding: enforce one active owner membership per user and make
-- create_merchant_account atomically idempotent under concurrency.
--
-- MVP rule:
--   * A user may hold at most one active 'owner' membership.
--   * A merchant may have many locations and many members.
--   * A user may still be a non-owner (admin/staff) member of other merchants.

-- 1. Database-level guarantee: at most one active owner membership per user.
--    This is the authoritative backstop, independent of any application check.
create unique index if not exists merchant_members_one_active_owner_per_user
  on public.merchant_members (user_id)
  where status = 'active' and role = 'owner';

-- 2/3/4/5. Atomically idempotent merchant onboarding.
--    Signature, security, validation, and return shape are preserved. A
--    transaction-scoped advisory lock serializes concurrent calls for the same
--    auth.uid(), so the second caller observes the first caller's committed
--    membership and returns it instead of racing on the unique index.
create or replace function public.create_merchant_account(
  p_display_name text,
  p_legal_name text default null,
  p_description text default null,
  p_support_email text default null,
  p_support_phone text default null,
  p_website_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_merchant_id uuid;
  v_name text := nullif(trim(p_display_name), '');
  v_existing record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'display_name is required';
  end if;

  -- Serialize concurrent onboarding for this user within the transaction.
  -- The lock is released automatically on commit or rollback, so a failed
  -- call never blocks a later retry and never leaves an orphan row.
  perform pg_advisory_xact_lock(
    hashtextextended('lokala.merchant_onboarding:' || v_uid::text, 0)
  );

  -- Idempotent fast path: return the user's existing actively owned merchant.
  select ma.id, ma.display_name, ma.status
    into v_existing
  from public.merchant_members mm
  join public.merchant_accounts ma on ma.id = mm.merchant_account_id
  where mm.user_id = v_uid
    and mm.status = 'active'
    and mm.role = 'owner'
  limit 1;

  if found then
    return jsonb_build_object(
      'merchant_account_id', v_existing.id,
      'display_name', v_existing.display_name,
      'status', v_existing.status,
      'owner_user_id', v_uid,
      'owner_role', 'owner',
      'idempotent', true
    );
  end if;

  -- Create exactly one merchant and one active owner membership together.
  -- Both inserts share this transaction: if the membership insert fails (for
  -- example, the partial unique index rejects a concurrent duplicate), the
  -- merchant_accounts insert is rolled back too, so no orphan can remain.
  insert into public.merchant_accounts (
    display_name,
    legal_name,
    description,
    support_email,
    support_phone,
    website_url,
    status,
    created_by
  ) values (
    v_name,
    nullif(trim(p_legal_name), ''),
    nullif(trim(p_description), ''),
    nullif(trim(p_support_email), ''),
    nullif(trim(p_support_phone), ''),
    nullif(trim(p_website_url), ''),
    'draft',
    v_uid
  )
  returning id into v_merchant_id;

  insert into public.merchant_members (
    merchant_account_id,
    user_id,
    role,
    status
  ) values (
    v_merchant_id,
    v_uid,
    'owner',
    'active'
  );

  return jsonb_build_object(
    'merchant_account_id', v_merchant_id,
    'display_name', v_name,
    'status', 'draft',
    'owner_user_id', v_uid,
    'owner_role', 'owner',
    'idempotent', false
  );
end;
$$;

revoke all on function public.create_merchant_account(text, text, text, text, text, text) from public;
grant execute on function public.create_merchant_account(text, text, text, text, text, text) to authenticated;
