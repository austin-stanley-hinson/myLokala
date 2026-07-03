import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner } from "@/lib/auth/business-profile";
import { getStripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

type PaymentAccountRow = {
  stripe_account_id: string | null;
};

/**
 * Start Stripe Connect hosted onboarding for the signed-in business owner.
 *
 * Server-only: uses the Supabase server client (session cookies) for auth and
 * the server Stripe helper (STRIPE_SECRET_KEY). Returns the hosted onboarding
 * URL as JSON so the caller can redirect the merchant to Stripe.
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

  // Only authenticated business owners may start onboarding.
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

    // Look up any existing payment account row for this owner (RLS scopes the
    // read to auth.uid() = owner_id).
    const { data: existing, error: lookupError } = await supabase
      .from("business_payment_accounts")
      .select("stripe_account_id")
      .eq("owner_id", user.id)
      .maybeSingle<PaymentAccountRow>();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    // Reuse the connected account if one already exists; otherwise create a new
    // Express account with only the capabilities needed to accept payments and
    // receive payouts (no card issuing).
    let accountId = existing?.stripe_account_id ?? null;
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
    }

    // Persist the account id and mark onboarding as pending. Upsert on owner_id
    // handles both the first-time (insert) and re-onboarding (update) cases
    // without clobbering the capability flags maintained elsewhere.
    const { error: saveError } = await supabase
      .from("business_payment_accounts")
      .upsert(
        {
          owner_id: user.id,
          stripe_account_id: accountId,
          onboarding_status: "pending",
        },
        { onConflict: "owner_id" },
      );

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    // Build return/refresh URLs from the request origin so the same route works
    // across local, preview, and production hosts.
    const origin = request.nextUrl.origin;
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: `${origin}/business/payments/return`,
      refresh_url: `${origin}/business#payments`,
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start Stripe onboarding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
