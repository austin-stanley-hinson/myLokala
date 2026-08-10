import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner } from "@/lib/auth/business-profile";
import { connectedAccountUsableInMode } from "@/lib/stripe/connect-readiness";
import { getStripe, isStripePlatformLive } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

type PaymentAccountRow = {
  stripe_account_id: string | null;
  livemode: boolean | null;
  previous_stripe_account_id: string | null;
};

/**
 * Start Stripe Connect hosted onboarding for the signed-in business owner.
 *
 * Reuses a connected account only when it matches the current platform Stripe
 * mode (test vs live). A stale TEST acct_... left over after switching to
 * sk_live is preserved on previous_stripe_account_id and replaced with a new
 * Express account created under the live key.
 */
export async function POST(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.json(
      { error: "Server is not configured." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isBusinessOwner(user)) {
    return NextResponse.json(
      { error: "Only business owners can connect Stripe." },
      { status: 403 },
    );
  }

  try {
    const stripe = getStripe();
    const platformLive = isStripePlatformLive();

    const { data: existing, error: lookupError } = await supabase
      .from("business_payment_accounts")
      .select("stripe_account_id, livemode, previous_stripe_account_id")
      .eq("owner_id", user.id)
      .maybeSingle<PaymentAccountRow>();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    let accountId = existing?.stripe_account_id ?? null;
    let previousAccountId = existing?.previous_stripe_account_id ?? null;
    let replacingWrongMode = false;

    if (
      accountId &&
      !connectedAccountUsableInMode(existing?.livemode, platformLive)
    ) {
      // Wrong-mode (typically TEST after sk_live cutover): do not retrieve or
      // reuse. Keep the old id for history and create a fresh Express account.
      previousAccountId = accountId;
      accountId = null;
      replacingWrongMode = true;
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      replacingWrongMode = replacingWrongMode || Boolean(existing?.stripe_account_id);
    }

    // Same-mode reuse: keep existing capability flags. Wrong-mode replacement
    // or first create: reset readiness until Stripe confirms the new account.
    const savePayload: Record<string, unknown> = {
      owner_id: user.id,
      stripe_account_id: accountId,
      livemode: platformLive,
      previous_stripe_account_id: previousAccountId,
    };

    if (replacingWrongMode || !existing?.stripe_account_id) {
      savePayload.onboarding_status = "pending";
      savePayload.charges_enabled = false;
      savePayload.payouts_enabled = false;
      savePayload.details_submitted = false;
    } else {
      // Re-onboarding the same-mode account: mark pending while they finish
      // Account Link, without wiping last-known capability flags until refresh.
      savePayload.onboarding_status = "pending";
    }

    const { error: saveError } = await supabase
      .from("business_payment_accounts")
      .upsert(savePayload, { onConflict: "owner_id" });

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    const origin = request.nextUrl.origin;
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: `${origin}/business/payments/return`,
      refresh_url: `${origin}/business/payments`,
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start Stripe onboarding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
