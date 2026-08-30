import { getBusinessContext } from "@/lib/auth/business-context";
import { DeferredFeatureNotice } from "@/components/layout/deferred-feature-notice";

export const dynamic = "force-dynamic";

/**
 * QUARANTINED (gift-balance MVP): this was the Stripe Connect hosted-onboarding
 * return page. It re-read the legacy `business_payment_accounts` table and the
 * Stripe account, both part of the deferred payments rebuild. Onboarding can no
 * longer be started (see `/business/payments`), so this page no longer queries
 * any legacy table or calls Stripe. The session + active `merchant_members`
 * guard (`getBusinessContext`) is preserved and still gates this page.
 */
export default async function PaymentsReturnPage() {
  // Guard: only active merchant members reach this page.
  await getBusinessContext();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <DeferredFeatureNotice
        eyebrow="Payments"
        title="Payment setup is being rebuilt"
        description="Payment onboarding isn't available yet — it's being rebuilt on the new Lokala platform. There's nothing to finish here right now."
        actions={[{ href: "/business", label: "Back to dashboard" }]}
      />
    </div>
  );
}
