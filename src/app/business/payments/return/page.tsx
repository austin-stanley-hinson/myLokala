import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner } from "@/lib/auth/business-profile";
import { readinessPatchFromStripeAccount } from "@/lib/stripe/connect-readiness";
import { getStripe, isStripePlatformLive } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

type PaymentAccountRow = {
  stripe_account_id: string | null;
};

/**
 * Return destination for Stripe Connect hosted onboarding.
 *
 * Server-only: re-reads the connected account from Stripe, refreshes the
 * cached status/flags in business_payment_accounts, then shows a simple
 * success / needs-action screen linking back to the dashboard.
 */
export default async function PaymentsReturnPage() {
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
  if (!isBusinessOwner(user)) {
    redirect("/");
  }

  const { data: account } = await supabase
    .from("business_payment_accounts")
    .select("stripe_account_id")
    .eq("owner_id", user.id)
    .maybeSingle<PaymentAccountRow>();

  // Nothing to refresh without a connected account — send them back to start.
  if (!account?.stripe_account_id) {
    redirect("/business/payments");
  }

  let onboarding_status = "pending";
  let errorMessage: string | null = null;

  try {
    const stripe = getStripe();
    const stripeAccount = await stripe.accounts.retrieve(
      account.stripe_account_id,
    );
    const patch = readinessPatchFromStripeAccount(
      stripeAccount,
      isStripePlatformLive(),
    );
    onboarding_status = patch.onboarding_status;

    const { error: updateError } = await supabase
      .from("business_payment_accounts")
      .update({
        charges_enabled: patch.charges_enabled,
        payouts_enabled: patch.payouts_enabled,
        details_submitted: patch.details_submitted,
        onboarding_status: patch.onboarding_status,
        livemode: patch.livemode,
      })
      .eq("owner_id", user.id);

    if (updateError) {
      errorMessage = updateError.message;
    }
  } catch (err) {
    errorMessage =
      err instanceof Error
        ? err.message
        : "Could not refresh your Stripe status.";
  }

  const isComplete = onboarding_status === "complete";
  const heading = errorMessage
    ? "We couldn't refresh your status"
    : isComplete
      ? "Your Stripe account is connected"
      : "Almost there";
  const body = errorMessage
    ? errorMessage
    : isComplete
      ? "Charges and payouts are enabled. You can now sell gift certificates and receive payouts."
      : "Stripe still needs a few more details before you can accept payments and receive payouts. You can resume onboarding from your dashboard.";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <div className="rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Payments
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-lokala-brown-dark">
          {heading}
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">{body}</p>

        <Link
          href="/business/payments"
          className="mt-6 inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
