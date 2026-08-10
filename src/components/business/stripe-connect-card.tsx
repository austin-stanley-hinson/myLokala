"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";

type StatusPill = {
  label: string;
  className: string;
};

/**
 * Dashboard entry point for Stripe Connect onboarding.
 *
 * Reflects the merchant's current payment readiness and starts (or resumes)
 * hosted onboarding by calling POST /api/stripe/connect/onboard and redirecting
 * to the returned Stripe URL. The Stripe secret key never touches the client —
 * the route runs entirely on the server.
 */
export function StripeConnectCard({
  onboardingStatus,
  chargesEnabled,
  payoutsEnabled,
  paymentsReady,
}: {
  onboardingStatus: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Server-computed: readiness flags AND connected account matches platform mode. */
  paymentsReady?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected =
    paymentsReady ??
    (onboardingStatus === "complete" && chargesEnabled && payoutsEnabled);
  const inProgress =
    onboardingStatus === "pending" || onboardingStatus === "restricted";

  const pill: StatusPill = connected
    ? {
        label: "Connected",
        className: "bg-lokala-green-light text-lokala-green-dark",
      }
    : onboardingStatus === "restricted"
      ? {
          label: "Action needed",
          className: "bg-lokala-danger/10 text-lokala-danger",
        }
      : onboardingStatus === "pending"
        ? {
            label: "In review",
            className: "bg-lokala-brown-soft text-lokala-brown",
          }
        : {
            label: "Not connected",
            className: "bg-lokala-brown-soft text-lokala-brown",
          };

  const buttonLabel = inProgress
    ? "Continue Stripe setup"
    : "Connect with Stripe";

  const description = connected
    ? "Your Stripe account is connected. You can accept gift certificate payments and receive payouts."
    : onboardingStatus === "restricted"
      ? "Stripe needs more information before you can accept payments and receive payouts. Continue setup to resolve it."
      : onboardingStatus === "pending"
        ? "Stripe is finishing verifying your account. Continue setup if any details are still required."
        : "Connect Stripe to sell gift certificates and receive payouts. You'll need a connected Stripe account before you can accept paid gift certificate purchases from local customers.";

  async function startOnboarding() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.url) {
        setError(
          data?.error ?? "Could not start Stripe onboarding. Please try again.",
        );
        setLoading(false);
        return;
      }

      // Hand off to Stripe's hosted onboarding. Keep loading true so the button
      // stays disabled through the redirect.
      window.location.href = data.url;
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <section
      id="payments"
      className="scroll-mt-24 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
            {connected ? (
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            ) : (
              <CreditCard className="h-6 w-6" aria-hidden="true" />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-lokala-brown-dark">
                Payments
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${pill.className}`}
              >
                {pill.label}
              </span>
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-lokala-muted">
              {description}
            </p>
            {error ? (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-lokala-danger/30 bg-lokala-danger/5 px-3 py-2 text-sm text-lokala-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>

        {connected ? null : (
          <div className="flex flex-col items-start sm:pt-1">
            <button
              type="button"
              onClick={() => void startOnboarding()}
              disabled={loading}
              className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Starting…
                </>
              ) : (
                buttonLabel
              )}
            </button>
            <p className="mt-2 max-w-[13rem] text-left text-xs text-lokala-muted">
              Securely set up payments and payouts through Stripe.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
