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

type ReconcileProfileRow = {
  account_type: string | null;
  full_name: string | null;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_website: string | null;
};

const isNonEmpty = (value: string | null): boolean =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Login-time reconciliation. Returns whether the user is a business owner and
 * keeps `profiles` authoritative:
 *
 *  - `profiles.account_type = 'business_owner'` → owner, no write (so dashboard
 *    edits to business fields are never overwritten by stale metadata).
 *  - no profiles row yet, but metadata says owner → create it from metadata.
 *  - profiles row exists as customer/null, but metadata says owner (e.g. a
 *    default 'customer' row from the signup trigger) → promote `account_type`
 *    and backfill ONLY the business fields that are currently empty, never
 *    overwriting fields the merchant may have already set.
 *  - otherwise → not an owner (mobile-created customers stay customers).
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
    .select(
      "account_type, full_name, business_name, business_address, business_phone, business_website",
    )
    .eq("id", user.id)
    .maybeSingle<ReconcileProfileRow>();

  // Established business owner — trust profiles, write nothing.
  if (profile?.account_type === BUSINESS_ACCOUNT_TYPE) {
    return true;
  }

  // Not marked as an owner in profiles; only metadata can make them one.
  if (!isBusinessOwner(user)) {
    return false;
  }

  // No row yet — create it authoritatively from the signup metadata.
  if (!profile) {
    await upsertBusinessProfileFromMetadata(supabase, user);
    return true;
  }

  // Row exists but isn't marked an owner: promote account_type and backfill
  // only the empty fields, preserving anything already saved.
  const meta = user.user_metadata ?? {};
  const patch: Record<string, string> = { account_type: BUSINESS_ACCOUNT_TYPE };

  const backfill = (column: keyof ReconcileProfileRow, metaValue: unknown) => {
    if (isNonEmpty(profile[column])) return;
    const value = toText(metaValue);
    if (value) patch[column] = value;
  };

  backfill("full_name", meta.full_name);
  backfill("business_name", meta.business_name);
  backfill("business_address", meta.business_address);
  backfill("business_phone", meta.business_phone);
  backfill("business_website", meta.business_website);

  await supabase.from("profiles").update(patch).eq("id", user.id);
  return true;
}
