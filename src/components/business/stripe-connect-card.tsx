import { CreditCard } from "lucide-react";

/**
 * Dashboard entry point for Stripe Connect onboarding.
 *
 * This is presentational only — the Stripe integration is not built yet, so
 * the action is disabled and clearly labelled as not-yet-available.
 */
export function StripeConnectCard() {
  return (
    <section
      id="payments"
      className="scroll-mt-24 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
            <CreditCard className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-lokala-brown-dark">
                Payments
              </h2>
              <span className="rounded-full bg-lokala-brown-soft px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-lokala-brown">
                Not connected
              </span>
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-lokala-muted">
              Connect Stripe to sell gift certificates and receive payouts.
              You&apos;ll need a connected Stripe account before you can accept
              paid gift certificate purchases from local customers.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Stripe onboarding is not available yet"
            className="cursor-not-allowed rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white opacity-60 shadow-lokala-soft"
          >
            Connect Stripe
          </button>
          <p className="text-xs font-semibold text-lokala-muted">Coming soon</p>
        </div>
      </div>
    </section>
  );
}
