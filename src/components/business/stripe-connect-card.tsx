"use client";

import { useState } from "react";
import { Banknote, CheckCircle2, Loader2 } from "lucide-react";

import { parseConnectRedirectResponse } from "@/lib/stripe/connect-redirect";
import {
  connectPayoutView,
  type MerchantConnectStatus,
} from "@/lib/stripe/connect-status";

/**
 * Merchant payout onboarding card.
 *
 * Starts or resumes hosted Express onboarding via POST /api/stripe/connect/onboard.
 * The Stripe secret key never touches the client.
 */
export function StripeConnectCard({
  status,
  canManage,
  syncError,
}: {
  status: MerchantConnectStatus;
  canManage: boolean;
  syncError?: string | null;
}) {
  const [loading, setLoading] = useState<"onboard" | "login" | null>(null);
  const [error, setError] = useState<string | null>(syncError ?? null);
  const view = connectPayoutView(status, canManage);
  const eventuallyDueNotice =
    status.requirementsEventuallyDue.length > 0 &&
    view.tone !== "restricted" &&
    view.tone !== "disabled";

  async function postForUrl(path: string) {
    const response = await fetch(path, { method: "POST" });
    const data: unknown = await response.json().catch(() => null);
    const parsed = parseConnectRedirectResponse(data, response.ok);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    window.location.assign(parsed.url);
  }

  async function startOnboarding() {
    setLoading("onboard");
    setError(null);
    try {
      await postForUrl("/api/stripe/connect/onboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the server. Please try again.",
      );
      setLoading(null);
    }
  }

  async function openDashboard() {
    setLoading("login");
    setError(null);
    try {
      await postForUrl("/api/stripe/connect/login-link");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the server. Please try again.",
      );
      setLoading(null);
    }
  }

  const pillClass =
    view.tone === "ready"
      ? "bg-lokala-green-light text-lokala-green-dark"
      : view.tone === "disabled"
        ? "bg-lokala-danger/10 text-lokala-danger"
        : view.tone === "restricted"
          ? "bg-lokala-danger/10 text-lokala-danger"
          : "bg-lokala-brown-soft text-lokala-brown";

  return (
    <section
      id="payments"
      className="scroll-mt-24 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
            {view.tone === "ready" ? (
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Banknote className="h-6 w-6" aria-hidden="true" />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-lokala-brown-dark">
                Payouts
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${pillClass}`}
              >
                {view.pillLabel}
              </span>
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-lokala-muted">
              {view.description}
            </p>
            {eventuallyDueNotice ? (
              <p className="mt-3 rounded-xl border border-lokala-border bg-lokala-cream-light/80 px-3 py-2 text-sm leading-6 text-lokala-brown">
                Stripe may ask for more information later. That does not block
                Lokala settlements right now.
              </p>
            ) : null}
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

        {canManage ? (
          <div className="flex flex-col items-start gap-2 sm:pt-1">
            {view.showOnboard ? (
              <button
                type="button"
                onClick={() => void startOnboarding()}
                disabled={loading !== null}
                className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === "onboard" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Starting…
                  </>
                ) : (
                  view.onboardLabel
                )}
              </button>
            ) : null}
            {view.showLogin ? (
              <button
                type="button"
                onClick={() => void openDashboard()}
                disabled={loading !== null}
                className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === "login" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Opening…
                  </>
                ) : (
                  "Open Stripe dashboard"
                )}
              </button>
            ) : null}
            <p className="mt-1 max-w-[13rem] text-left text-xs text-lokala-muted">
              Stripe hosts identity and bank details. Lokala never sees your
              account number.
            </p>
          </div>
        ) : (
          <p className="max-w-[13rem] text-xs leading-5 text-lokala-muted sm:pt-1">
            View only — ask an owner or admin to connect payouts.
          </p>
        )}
      </div>
    </section>
  );
}
