import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Merchant authorization helpers.
 *
 * Authorization architecture (see `web/docs/gift-balance-mvp-database.md`):
 *   - `profiles` represents a person and carries NO role/account-type.
 *   - An active `merchant_members` row is the ONLY source of merchant
 *     authorization. A person may be a customer, a merchant member, or both.
 *   - `merchant_accounts` is the business; `create_merchant_account` is the only
 *     client-accessible creation path (RLS blocks direct inserts + self-escalation).
 *
 * Every function is typed against the generated `Database` schema and accepts a
 * caller-supplied Supabase client so it works from Server Components, Route
 * Handlers, Server Actions, and Client Components alike. RLS scopes all reads to
 * the authenticated user, so these never leak another user's data.
 */

export type MerchantRole = "owner" | "admin" | "staff";

/** Owner and admin may mutate merchant profile, locations, and payment hubs. */
export function canManageMerchant(role: MerchantRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export type MerchantAccount =
  Database["public"]["Tables"]["merchant_accounts"]["Row"];

export type ActiveMembership = {
  merchantAccountId: string;
  role: MerchantRole;
};

export type MerchantContext = {
  userId: string;
  displayName: string | null;
  role: MerchantRole;
  merchant: MerchantAccount;
};

type TypedClient = SupabaseClient<Database>;

const MERCHANT_ROLES: readonly MerchantRole[] = ["owner", "admin", "staff"];

function toMerchantRole(value: string | null | undefined): MerchantRole | null {
  return value && (MERCHANT_ROLES as readonly string[]).includes(value)
    ? (value as MerchantRole)
    : null;
}

/**
 * The caller's active merchant membership, or `null` when they belong to no
 * active merchant (i.e. a customer-only person). If a user somehow has more than
 * one active membership, the earliest-created one is treated as canonical so the
 * result is deterministic.
 */
export async function getActiveMembership(
  supabase: TypedClient,
  userId: string,
): Promise<ActiveMembership | null> {
  const { data, error } = await supabase
    .from("merchant_members")
    .select("merchant_account_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const role = toMerchantRole(data.role);
  if (!role) {
    return null;
  }

  return { merchantAccountId: data.merchant_account_id, role };
}

/** Whether the user is an active member of any merchant. */
export async function isActiveMerchantMember(
  supabase: TypedClient,
  userId: string,
): Promise<boolean> {
  return (await getActiveMembership(supabase, userId)) !== null;
}

/** Load a merchant account by id (RLS: only members may read it). */
export async function getMerchantAccount(
  supabase: TypedClient,
  merchantAccountId: string,
): Promise<MerchantAccount | null> {
  const { data, error } = await supabase
    .from("merchant_accounts")
    .select("*")
    .eq("id", merchantAccountId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export type CreateMerchantInput = {
  displayName: string;
  legalName?: string | null;
  description?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
};

export type CreateMerchantResult =
  | { ok: true; merchantAccountId: string; alreadyMember: boolean }
  | { ok: false; error: string };

const toParam = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Create a merchant account for the authenticated caller via the
 * `create_merchant_account` RPC (creator becomes the active `owner`).
 *
 * Application-layer idempotency: if the caller already has an active membership
 * we return it instead of creating a second business. This makes callback
 * retries, page refreshes, and sequential double-submits safe. See the file
 * `web/docs` note in the audit for the remaining strictly-concurrent race, which
 * requires a database uniqueness constraint to close atomically.
 */
export async function createMerchantAccount(
  supabase: TypedClient,
  userId: string,
  input: CreateMerchantInput,
): Promise<CreateMerchantResult> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    return { ok: false, error: "Business name is required." };
  }

  // Idempotency pre-check: never create a second merchant for an existing member.
  const existing = await getActiveMembership(supabase, userId);
  if (existing) {
    return {
      ok: true,
      merchantAccountId: existing.merchantAccountId,
      alreadyMember: true,
    };
  }

  const { data, error } = await supabase.rpc("create_merchant_account", {
    p_display_name: displayName,
    p_legal_name: toParam(input.legalName),
    p_description: toParam(input.description),
    p_support_email: toParam(input.supportEmail),
    p_support_phone: toParam(input.supportPhone),
    p_website_url: toParam(input.websiteUrl),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const merchantAccountId =
    data && typeof data === "object" && !Array.isArray(data)
      ? ((data as Record<string, unknown>).merchant_account_id as
          | string
          | undefined)
      : undefined;

  if (!merchantAccountId) {
    return { ok: false, error: "Merchant account could not be created." };
  }

  return { ok: true, merchantAccountId, alreadyMember: false };
}
