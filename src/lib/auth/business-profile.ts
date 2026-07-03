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
 * yet — e.g. on the very first sign-in before `ensureBusinessProfile` runs.
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
 * Ensure the signed-in user has a business profile row, creating it from auth
 * metadata only when one does not exist yet.
 *
 * The `profiles` table is the source of truth for editable business details, so
 * once a row exists this leaves it untouched — dashboard edits must never be
 * clobbered by (possibly stale) auth metadata on a later login.
 *
 * Requires an authenticated session (RLS scopes writes to `auth.uid() = id`).
 *
 * Returns `{ error }` mirroring the shape of a Supabase query result.
 */
export async function ensureBusinessProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<{ error: PostgrestError | null }> {
  // A row is only ever visible to its owner (RLS), so this scopes to the
  // current user without an explicit filter beyond the id.
  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) {
    return { error: lookupError };
  }

  // Row already exists — treat the profiles table as authoritative and do not
  // overwrite the business fields from auth metadata.
  if (existing) {
    return { error: null };
  }

  const meta = user.user_metadata ?? {};

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    full_name: toText(meta.full_name),
    account_type: BUSINESS_ACCOUNT_TYPE,
    business_name: toText(meta.business_name),
    business_address: toText(meta.business_address),
    business_phone: toText(meta.business_phone),
    business_website: toText(meta.business_website),
  });

  return { error: insertError };
}
