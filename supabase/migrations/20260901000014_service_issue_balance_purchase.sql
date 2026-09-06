-- Service-only wrapper: safely expose balance-purchase issuance to the API layer.
--
-- app_private is not in the Data API, so a service-role Supabase client
-- (PostgREST, e.g. createAdminClient()) cannot call
-- app_private.issue_balance_purchase directly. This thin, schema-qualified
-- wrapper is the only way the upcoming self-top-up purchase webhook will
-- reach it. Mirrors the pattern already established for Connect onboarding in
-- 20260901000013_stripe_connect_onboarding.sql (public.service_reserve_
-- stripe_connect_account and its siblings): SECURITY DEFINER, a pinned
-- search_path, execute revoked from public/anon/authenticated and granted
-- only to service_role.
--
-- Only the issuance wrapper is added here. The first purchase flow is
-- self-top-up only -- email gifting and claim tokens come later, so
-- app_private.claim_pending_gift and app_private.rotate_gift_claim_token stay
-- unwrapped (and therefore unreachable via the Data API) until that flow is
-- built, each with its own wrapper at that point.

create or replace function public.service_issue_balance_purchase(
  p_balance_purchase_id uuid,
  p_recipient_email_normalized text default null,
  p_claim_token_hash text default null
)
returns jsonb
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.issue_balance_purchase(
    p_balance_purchase_id,
    p_recipient_email_normalized,
    p_claim_token_hash
  );
$$;

revoke all on function public.service_issue_balance_purchase(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.service_issue_balance_purchase(uuid, text, text)
  to service_role;
