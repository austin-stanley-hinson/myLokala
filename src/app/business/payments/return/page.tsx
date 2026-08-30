import { getBusinessContext } from "@/lib/auth/business-context";
import { canManageMerchant } from "@/lib/auth/merchant";
import { StripeConnectCard } from "@/components/business/stripe-connect-card";
import {
  EMPTY_CONNECT_STATUS,
  connectPayoutView,
  parseMerchantConnectStatus,
} from "@/lib/stripe/connect-status";
import { syncConnectedAccountFromStripe } from "@/lib/stripe/connect-onboarding";
import { getStripe, isStripePlatformLive } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTypedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Hosted-onboarding return page.
 *
 * Returning from Stripe is not treated as completion. We retrieve the
 * current-mode connected account, refresh cached readiness, then render the
 * real status.
 */
export default async function PaymentsReturnPage() {
  const { merchant, role } = await getBusinessContext();
  const canManage = canManageMerchant(role);

  let syncError: string | null = null;
  try {
    const platformLive = isStripePlatformLive();
    const synced = await syncConnectedAccountFromStripe({
      stripe: getStripe(),
      admin: createAdminClient(),
      merchantAccountId: merchant.id,
      platformLive,
    });
    if (!synced.ok) {
      syncError = synced.error;
    }
  } catch {
    syncError =
      "Payout status could not be refreshed. Showing the last saved status.";
  }

  const supabase = await createTypedClient();
  const { data, error } = await supabase.rpc("get_merchant_connect_status", {
    p_merchant_account_id: merchant.id,
  });
  const status = error
    ? EMPTY_CONNECT_STATUS
    : parseMerchantConnectStatus(data);
  const view = connectPayoutView(status, canManage);

  const headline =
    view.tone === "ready"
      ? "Payouts are ready"
      : view.tone === "incomplete"
        ? "Stripe setup incomplete"
        : view.tone === "restricted" || view.tone === "disabled"
          ? "Stripe needs more information"
          : view.tone === "pending"
            ? "Stripe is still reviewing your account"
            : "Finish payout setup";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Payments
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          {headline}
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Coming back from Stripe does not always mean onboarding is finished.
          This page shows whether Lokala can settle redeemed balance to your
          restaurant.
        </p>
      </header>

      <StripeConnectCard
        status={status}
        canManage={canManage}
        syncError={error ? "Payout status could not be loaded." : syncError}
      />
    </div>
  );
}
