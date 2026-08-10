import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BUSINESS_ACCOUNT_TYPE, isBusinessOwner } from "@/lib/auth/business-profile";
import { connectedAccountUsableInMode } from "@/lib/stripe/connect-readiness";
import { isStripePlatformLive } from "@/lib/stripe/server";

export type BusinessProfile = {
  full_name: string | null;
  account_type: string | null;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_website: string | null;
};

export type PaymentAccount = {
  onboarding_status: string | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
  livemode?: boolean | null;
};

export type BusinessContext = {
  userId: string;
  ownerName: string | undefined;
  businessName: string;
  profile: BusinessProfile | null;
  paymentAccount: PaymentAccount | null;
};

/**
 * Shared loader for the business dashboard routes. Enforces business-owner
 * authorization (profiles.account_type is the source of truth, auth metadata is
 * the fallback) and returns the profile + payment account every business page
 * needs. Redirects non-owners away, so calling it guards the route.
 */
export async function getBusinessContext(): Promise<BusinessContext> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, account_type, business_name, business_address, business_phone, business_website",
    )
    .eq("id", user.id)
    .maybeSingle<BusinessProfile>();

  // Customers must never reach the business dashboard.
  const isOwner = profile?.account_type
    ? profile.account_type === BUSINESS_ACCOUNT_TYPE
    : isBusinessOwner(user);

  if (!isOwner) {
    redirect("/");
  }

  const { data: paymentAccount } = await supabase
    .from("business_payment_accounts")
    .select("onboarding_status, charges_enabled, payouts_enabled, livemode")
    .eq("owner_id", user.id)
    .maybeSingle<PaymentAccount>();

  const ownerName =
    profile?.full_name ?? (user.user_metadata?.full_name as string | undefined);
  const businessName =
    profile?.business_name ??
    (user.user_metadata?.business_name as string | undefined) ??
    "Your business";

  return {
    userId: user.id,
    ownerName,
    businessName,
    profile: profile ?? null,
    paymentAccount: paymentAccount ?? null,
  };
}

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
