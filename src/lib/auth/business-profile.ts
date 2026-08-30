/**
 * LEGACY metadata shim — DO NOT use for new authorization.
 *
 * Merchant authorization now comes exclusively from an active `merchant_members`
 * row; see `@/lib/auth/merchant` and `@/lib/auth/business-context`. The old
 * `profiles.account_type` / business-profile-field model has been removed, and
 * business sign-up no longer writes authorization claims into user metadata.
 *
 * `isBusinessOwner` is retained ONLY because two not-yet-migrated Stripe Connect
 * routes still import it:
 *   - `src/app/business/payments/return/page.tsx`
 *   - `src/app/api/stripe/connect/onboard/route.ts`
 *
 * Those routes are part of the deferred Stripe rebuild (out of scope here). This
 * shim reads legacy metadata only; for accounts created under the new flow it
 * returns `false`, which is safe because that Stripe layer is already inert
 * against the new schema. Delete this file once those routes move to
 * membership-based checks.
 */
type MetadataUser = {
  user_metadata?: Record<string, unknown> | null;
} | null;

const LEGACY_BUSINESS_ACCOUNT_TYPE = "business_owner";
const LEGACY_BUSINESS_ROLE = "restaurant_owner";

/**
 * @deprecated Legacy metadata check kept only for pending Stripe-rebuild routes.
 * Not the authorization source — use `isActiveMerchantMember` instead.
 */
export function isBusinessOwner(user: MetadataUser): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  return (
    meta.account_type === LEGACY_BUSINESS_ACCOUNT_TYPE ||
    meta.role === LEGACY_BUSINESS_ROLE
  );
}
