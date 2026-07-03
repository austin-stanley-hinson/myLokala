import type {
  PostgrestError,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

export const BUSINESS_ACCOUNT_TYPE = "business_owner";

// Legacy value used by earlier sign-ups before account_type existed. Kept so
// existing business owners keep routing into the business area.
const LEGACY_BUSINESS_ROLE = "restaurant_owner";

type MetadataUser = {
  user_metadata?: Record<string, unknown> | null;
} | null;

/**
 * Whether the signed-in user is a business owner based on auth user metadata.
 * Synchronous and works before the profile row is loaded, so it's a good
 * fallback / optimistic check — but `profiles.account_type` is authoritative
 * (see `resolveBusinessOwner`).
 */
export function isBusinessOwner(user: MetadataUser): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  return (
    meta.account_type === BUSINESS_ACCOUNT_TYPE ||
    meta.role === LEGACY_BUSINESS_ROLE
  );
}

/**
 * Resolve business ownership using the `profiles` table as the source of truth,
 * falling back to auth metadata when no profile row (or account_type) exists
 * yet. Read-only — for routing/nav decisions where no reconciliation is needed.
 *
 * Requires an authenticated session (RLS scopes the read to `auth.uid() = id`).
 */
export async function resolveBusinessOwner(
  supabase: SupabaseClient,
  user: User | null,
): Promise<boolean> {
  if (!user) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle<{ account_type: string | null }>();

  // profiles is authoritative when it has an account_type.
  if (!error && data?.account_type) {
    return data.account_type === BUSINESS_ACCOUNT_TYPE;
  }

  // No row / no account_type yet (or a read error) — fall back to metadata.
  return isBusinessOwner(user);
}

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/**
 * Authoritatively write the signed-in user's business profile from the data
 * captured in auth metadata at sign-up. Uses upsert so it both creates the row
 * and promotes an existing default row (a Supabase signup trigger typically
 * pre-creates a `profiles` row with `account_type = 'customer'`, which is why a
 * plain insert-if-missing left business signups stuck as customers).
 *
 * Intended for sign-up (and login reconciliation) where the submitted business
 * data is the source of truth. Not for routine logins — see
 * `reconcileBusinessOwnerOnLogin`, which avoids clobbering later edits.
 *
 * Requires an authenticated session (RLS scopes writes to `auth.uid() = id`).
 */
export async function upsertBusinessProfileFromMetadata(
  supabase: SupabaseClient,
  user: User,
): Promise<{ error: PostgrestError | null }> {
  const meta = user.user_metadata ?? {};

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      full_name: toText(meta.full_name),
      account_type: BUSINESS_ACCOUNT_TYPE,
      business_name: toText(meta.business_name),
      business_address: toText(meta.business_address),
      business_phone: toText(meta.business_phone),
      business_website: toText(meta.business_website),
    },
    { onConflict: "id" },
  );

  return { error };
}

/**
 * Login-time reconciliation. Returns whether the user is a business owner and
 * keeps `profiles` authoritative:
 *
 *  - `profiles.account_type = 'business_owner'` → owner, no write (so dashboard
 *    edits to business fields are never overwritten by stale metadata).
 *  - profiles doesn't mark them as an owner yet, but auth metadata does (a fresh
 *    account, an unconfirmed-then-confirmed signup, or a default 'customer' row
 *    from a signup trigger) → write the business profile from metadata, owner.
 *  - otherwise → not an owner.
 *
 * Metadata `account_type = 'business_owner'` is only ever set during business
 * sign-up, so promoting on it cannot mislabel a real customer.
 */
export async function reconcileBusinessOwnerOnLogin(
  supabase: SupabaseClient,
  user: User | null,
): Promise<boolean> {
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle<{ account_type: string | null }>();

  // Established business owner — trust profiles, write nothing.
  if (profile?.account_type === BUSINESS_ACCOUNT_TYPE) {
    return true;
  }

  // Not marked as an owner in profiles; only metadata can make them one.
  if (!isBusinessOwner(user)) {
    return false;
  }

  await upsertBusinessProfileFromMetadata(supabase, user);
  return true;
}
