import { getBusinessContext } from "@/lib/auth/business-context";
import { DeferredFeatureNotice } from "@/components/layout/deferred-feature-notice";
import { StripeFaqSection } from "@/components/business/stripe-faq-section";

export const dynamic = "force-dynamic";

/**
 * QUARANTINED (gift-balance MVP): the Stripe Connect card started hosted
 * onboarding by calling an API that reads/writes the legacy
 * `business_payment_accounts` table. Stripe/payments are part of the deferred
 * rebuild, so the live "Connect with Stripe" action is removed and replaced with
 * a stable "coming next" state. The session + active `merchant_members` guard
 * (`getBusinessContext`) is preserved and still gates this page. The Stripe
 * Connect components and API routes remain in the repo for the later phase.
 */
export default async function BusinessPaymentsPage() {
  // Guard: only active merchant members reach payments.
  await getBusinessContext();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Payments
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Payment setup
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Connect payments to accept Lokala and receive payouts.
        </p>
      </header>

      <DeferredFeatureNotice
        eyebrow="Coming next"
        title="Payment setup is being rebuilt"
        description="Connecting payments and payouts is being rebuilt on the new Lokala platform. You'll be able to set this up here soon — there's nothing you need to do right now."
        actions={[{ href: "/business", label: "Back to dashboard" }]}
      />

      <StripeFaqSection />
    </div>
  );
}
