/**
 * LEGACY metadata shim — DO NOT use for authorization.
 *
 * Merchant authorization comes exclusively from an active `merchant_members`
 * row. Stripe Connect onboarding uses `canManageMerchant` / membership checks
 * and must never import this file.
 *
 * Retained only so any leftover deferred payment code that still compiled
 * against metadata can fail closed (returns false for new accounts).
 */
type MetadataUser = {
  user_metadata?: Record<string, unknown> | null;
} | null;

const LEGACY_BUSINESS_ACCOUNT_TYPE = "business_owner";
const LEGACY_BUSINESS_ROLE = "restaurant_owner";

/**
 * @deprecated Not the authorization source. Do not use in Connect routes.
 */
export function isBusinessOwner(user: MetadataUser): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  return (
    meta.account_type === LEGACY_BUSINESS_ACCOUNT_TYPE ||
    meta.role === LEGACY_BUSINESS_ROLE
  );
}
