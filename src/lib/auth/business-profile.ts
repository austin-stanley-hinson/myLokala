import type { SupabaseClient, User } from "@supabase/supabase-js";

export const BUSINESS_ACCOUNT_TYPE = "business_owner";

// Legacy value used by earlier sign-ups before account_type existed. Kept so
// existing business owners keep routing into the business area.
const LEGACY_BUSINESS_ROLE = "restaurant_owner";

type MetadataUser = {
  user_metadata?: Record<string, unknown> | null;
} | null;

/**
 * Whether the signed-in user is a business owner. Reads from auth user
 * metadata so it can run before the profile row is loaded.
 */
export function isBusinessOwner(user: MetadataUser): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  return (
    meta.account_type === BUSINESS_ACCOUNT_TYPE ||
    meta.role === LEGACY_BUSINESS_ROLE
  );
}

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/**
 * Create or update the signed-in user's profile row from their auth metadata,
 * marking them as a business owner. Auth metadata captured at sign-up is the
 * source of truth for the business fields.
 *
 * Requires an authenticated session (RLS scopes writes to `auth.uid() = id`).
 */
export async function syncBusinessProfile(
  supabase: SupabaseClient,
  user: User,
) {
  const meta = user.user_metadata ?? {};

  return supabase.from("profiles").upsert(
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
}
