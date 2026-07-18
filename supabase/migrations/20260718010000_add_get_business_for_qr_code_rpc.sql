-- Controlled public lookup for active business QR codes.
--
-- business_qr_codes has no anon/public SELECT policy (by design). The public
-- /pay/[public_code] page calls this SECURITY DEFINER RPC instead, which
-- returns only safe display fields for an active QR owned by a business_owner.
--
-- Schema-only: do not db push from the agent. Apply manually in Supabase.

create or replace function public.get_business_for_qr_code(input_public_code text)
returns table (
  public_code text,
  business_name text,
  business_address text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.public_code,
    coalesce(nullif(trim(p.business_name), ''), 'Local business') as business_name,
    nullif(trim(p.business_address), '') as business_address
  from public.business_qr_codes q
  inner join public.profiles p
    on p.id = q.business_owner_id
  where q.public_code = trim(input_public_code)
    and length(trim(input_public_code)) > 0
    and q.is_active = true
    and p.account_type = 'business_owner'
  limit 1;
$$;

revoke all on function public.get_business_for_qr_code(text) from public;
grant execute on function public.get_business_for_qr_code(text) to anon, authenticated;
