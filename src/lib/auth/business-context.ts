import { redirect } from "next/navigation";

import { createTypedClient } from "@/lib/supabase/server";
import {
  getActiveMembership,
  getMerchantAccount,
  type MerchantContext,
} from "@/lib/auth/merchant";
import { connectedAccountUsableInMode } from "@/lib/stripe/connect-readiness";
import { isStripePlatformLive } from "@/lib/stripe/server";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";

/**
 * Server-side guard + loader for the business dashboard routes.
 *
 * Authorization is derived entirely from an active `merchant_members` row (the
 * source of truth) — never from `profiles` metadata or an account-type column.
 * Calling this at the top of a `/business/*` server component enforces the guard:
 *
 *   - Signed-out            → `/login`
 *   - Authenticated, no active membership → `/business/onboarding`
 *   - Active member         → returns the merchant context
 *
 * Middleware only refreshes the session; this is the real authorization boundary.
 */
export async function getBusinessContext(): Promise<MerchantContext> {
  if (!hasPublicSupabaseEnv()) {
    redirect("/login");
  }

  const supabase = await createTypedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    // Authenticated but not a merchant member yet → self-serve onboarding.
    redirect("/business/onboarding");
  }

  const merchant = await getMerchantAccount(
    supabase,
    membership.merchantAccountId,
  );
  if (!merchant) {
    // Membership without a readable merchant row is an inconsistent state;
    // treat it as "needs onboarding" rather than exposing an empty dashboard.
    redirect("/business/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    displayName: profile?.display_name ?? null,
    role: membership.role,
    merchant,
  };
}

// ---------------------------------------------------------------------------
// Stripe Connect payment readiness.
//
// Retained here (unchanged) because the Stripe payment layer still imports it.
// Stripe/settlements are being rebuilt separately on the new schema
// (`app_private.stripe_connected_accounts`), so this is intentionally left as-is
// and is out of scope for the Auth foundation work.
// ---------------------------------------------------------------------------

export type PaymentAccount = {
  onboarding_status: string | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
  livemode?: boolean | null;
};

/** Whether the merchant's Stripe account is fully connected (charges + payouts). */
export function isPaymentsConnected(account: PaymentAccount | null): boolean {
  if (
    account?.onboarding_status !== "complete" ||
    !account.charges_enabled ||
    !account.payouts_enabled
  ) {
    return false;
  }
  try {
    return connectedAccountUsableInMode(
      account.livemode ?? null,
      isStripePlatformLive(),
    );
  } catch {
    return false;
  }
}
