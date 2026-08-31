-- Unauthenticated-safe gift-claim preview, for the /claim/[token] page.
--
-- Unlike the service_* wrappers (service_role only, called from server code
-- holding the verified session), this function is meant to be called
-- directly by anon/authenticated clients -- a visitor may not be signed in
-- yet when they first open the claim link. The unguessable hash IS the
-- credential for a preview read, the same trust model already used for the
-- raw token itself; this still only ever accepts a HASH, never a raw token --
-- the caller hashes the token server-side (Next.js Server Component) before
-- ever calling this function, so the raw token never appears in a query.
--
-- Returns only what the page needs to render a state (pending amount, or
-- already-claimed/expired/not-found) -- never gift_claims.id,
-- balance_purchase_id, purchaser/recipient identity, or the hash itself.

create or replace function public.preview_gift_claim(
  p_claim_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_claim app_private.gift_claims%rowtype;
  v_purchase public.balance_purchases%rowtype;
begin
  if p_claim_token_hash is null or length(trim(p_claim_token_hash)) = 0 then
    return jsonb_build_object('found', false);
  end if;

  select * into v_claim
  from app_private.gift_claims
  where claim_token_hash = trim(p_claim_token_hash);

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select * into v_purchase
  from public.balance_purchases
  where id = v_claim.balance_purchase_id;

  if not found then
    -- Should not happen (balance_purchase_id is a NOT NULL FK), but never
    -- surface an internal inconsistency as anything but "not found".
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'status', v_claim.status,
    'face_value_cents', v_purchase.face_value_cents,
    'currency', v_purchase.currency
  );
end;
$$;

revoke all on function public.preview_gift_claim(text) from public;
grant execute on function public.preview_gift_claim(text) to anon, authenticated;
