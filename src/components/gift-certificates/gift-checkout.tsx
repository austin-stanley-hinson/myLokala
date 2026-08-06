"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { getStripePromise } from "@/lib/stripe/client";

const currency = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** All server amounts are integer cents. */
const centsToCurrency = (cents: number) => currency(cents / 100);

export type GiftPurchase = {
  amount: number;
  recipientName: string;
  recipientEmail: string;
  note: string;
  paymentMethod: "card" | "bank";
  processingFee: number;
  total: number;
};

/** The payment session returned by POST /api/payments. */
type PaymentSession = {
  paymentId: string;
  status: string;
  subtotalCents: number;
  tipCents: number;
  customerFeeCents: number;
  totalCents: number;
  currency: string;
  feePolicyVersion: string;
  clientSecret: string | null;
};

const stripePromise = getStripePromise();

/**
 * Stable clientRequestId for one payment attempt.
 *
 * Persisted in sessionStorage so a reload or an accidental back-and-forward
 * resumes the SAME attempt rather than starting a second one -- the server keys
 * idempotency off this value, so reusing it is what makes a retry safe.
 *
 * The key includes the amount and recipient, so genuinely editing the gift
 * details yields a new id, which is correct: that is a new payment attempt.
 */
function attemptRequestId(subtotalCents: number, recipientEmail: string): string {
  const key = `lokala.gift.crid.${subtotalCents}.${recipientEmail.trim().toLowerCase()}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    // Private mode or storage disabled: fall back to a per-mount id. The charge
    // is still single because Stripe's idempotency key derives from it.
    return crypto.randomUUID();
  }
}

function clearAttemptRequestId(subtotalCents: number, recipientEmail: string): void {
  try {
    window.sessionStorage.removeItem(
      `lokala.gift.crid.${subtotalCents}.${recipientEmail.trim().toLowerCase()}`,
    );
  } catch {
    // Nothing to clear.
  }
}

/**
 * Gift-certificate checkout. Starts a durable Lokala payment, mounts Stripe
 * Elements against the returned client secret, and confirms in-page — card
 * details go straight from the browser to Stripe and never touch our server.
 *
 * Credit is NOT issued by this component. The signature-verified Stripe webhook
 * is the only thing that delivers a gift, so closing the tab after paying no
 * longer loses the delivery. After confirming, this reads the canonical ledger
 * status instead of asserting success itself.
 */
export function GiftCheckout({
  purchase,
  onBack,
}: {
  purchase: GiftPurchase;
  onBack: () => void;
}) {
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const requested = useRef(false);

  const subtotalCents = Math.round(purchase.amount * 100);

  // Start the payment once when the checkout opens.
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "gift_certificate_purchase",
            clientRequestId: attemptRequestId(subtotalCents, purchase.recipientEmail),
            // Integer cents. Fees and the total are computed server-side; any
            // amount we sent for those would be ignored.
            subtotalCents,
            paymentMethod: purchase.paymentMethod === "bank" ? "ach" : "card",
            recipient: {
              email: purchase.recipientEmail,
              name: purchase.recipientName,
              note: purchase.note,
            },
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          if (data.code === "already_succeeded") {
            if (!cancelled) setAlreadyPaid(true);
            return;
          }
          if (data.code === "attempt_closed" || data.code === "request_mismatch") {
            // That attempt can never be paid; the next mount gets a fresh id.
            clearAttemptRequestId(subtotalCents, purchase.recipientEmail);
          }
          throw new Error(data.error || "Could not start checkout.");
        }

        if (!cancelled) setSession(data as PaymentSession);
      } catch (err) {
        if (!cancelled) {
          setInitError(
            err instanceof Error ? err.message : "Could not start checkout.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purchase, subtotalCents]);

  return (
    <section className="bg-lokala-cream-light px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-lokala-border bg-white px-4 py-2 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
        >
          ← Edit gift details
        </button>

        <div className="grid min-h-[560px] gap-6 md:grid-cols-2">
          <section className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card sm:p-8">
            <h2 className="text-2xl font-extrabold text-lokala-brown-dark">
              Payment details
            </h2>
            <p className="mt-1 text-sm text-lokala-muted">
              Pay securely with card. Your card is handled by Stripe and never
              touches our servers.
            </p>

            <div className="mt-6">
              {alreadyPaid ? (
                <PaymentComplete purchase={purchase} delivered={false} alreadyPaid />
              ) : initError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {initError}
                </p>
              ) : !session?.clientSecret ? (
                <p className="text-sm text-lokala-muted">Loading secure checkout…</p>
              ) : (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: session.clientSecret,
                    appearance: { theme: "flat", variables: { colorPrimary: "#2f7d4f" } },
                  }}
                >
                  <CheckoutForm purchase={purchase} session={session} />
                </Elements>
              )}
            </div>
          </section>

          <PurchaseSummary purchase={purchase} session={session} />
        </div>
      </div>
    </section>
  );
}

/**
 * Read the canonical ledger status, which the webhook owns.
 *
 * Returns null when the status cannot be read — notably for a guest checkout,
 * where there is no session to authorize the request. In that case the caller
 * falls back to the Stripe confirmation result, which still proves the payment
 * was taken; delivery is the webhook's job either way.
 */
async function readCanonicalStatus(paymentId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/payments/${paymentId}`, { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.status === "string" ? data.status : null;
  } catch {
    return null;
  }
}

function CheckoutForm({
  purchase,
  session,
}: {
  purchase: GiftPurchase;
  session: PaymentSession;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [settled, setSettled] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status !== "succeeded") {
      setError("Payment did not complete. Please try again.");
      setSubmitting(false);
      return;
    }

    // Stripe took the payment. Delivery is the webhook's job, so we only report
    // status here — this component never issues credit.
    setComplete(true);
    setSubmitting(false);

    // Give the webhook a moment, then read the canonical status.
    const canonical = await readCanonicalStatus(session.paymentId);
    setSettled(canonical === "succeeded");
  }

  if (complete) {
    return <PaymentComplete purchase={purchase} delivered={settled} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-full bg-lokala-green px-6 py-4 font-extrabold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
      >
        {submitting
          ? "Processing…"
          : `Pay ${centsToCurrency(session.totalCents)}`}
      </button>
    </form>
  );
}

function PaymentComplete({
  purchase,
  delivered,
  alreadyPaid = false,
}: {
  purchase: GiftPurchase;
  delivered: boolean;
  alreadyPaid?: boolean;
}) {
  const recipient = purchase.recipientName || purchase.recipientEmail;

  return (
    <div className="rounded-2xl border border-lokala-green bg-lokala-green-soft px-5 py-6">
      <p className="text-lg font-extrabold text-lokala-brown-dark">
        🎉 Payment complete
      </p>
      <p className="mt-2 text-sm leading-6 text-lokala-brown">
        {alreadyPaid
          ? "This gift has already been paid for. Nothing was charged again."
          : delivered
            ? `${currency(purchase.amount)} in Lokala credit is on its way to ${recipient}.`
            : `We received your payment. ${
                recipient || "Your recipient"
              } will get ${currency(
                purchase.amount,
              )} in Lokala credit once it finishes processing — you can close this page safely.`}
      </p>
      <Link
        href="/browse"
        className="mt-4 inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
      >
        Browse deals
      </Link>
    </div>
  );
}

/**
 * Purchase summary. Once the server has quoted the payment, the server's
 * integer-cent breakdown is displayed rather than the client's estimate, so what
 * is shown is always exactly what will be charged.
 */
function PurchaseSummary({
  purchase,
  session,
}: {
  purchase: GiftPurchase;
  session: PaymentSession | null;
}) {
  const amountLabel = session
    ? centsToCurrency(session.subtotalCents)
    : currency(purchase.amount);
  const feeLabel = session
    ? centsToCurrency(session.customerFeeCents)
    : currency(purchase.processingFee);
  const totalLabel = session
    ? centsToCurrency(session.totalCents)
    : currency(purchase.total);

  return (
    <aside className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card sm:p-8">
      <h2 className="text-2xl font-extrabold text-lokala-brown-dark">
        Purchase summary
      </h2>

      {purchase.recipientName || purchase.recipientEmail ? (
        <p className="mt-2 text-sm text-lokala-muted">
          For{" "}
          <span className="font-bold text-lokala-brown-dark">
            {purchase.recipientName || "your recipient"}
          </span>
          {purchase.recipientEmail ? ` · ${purchase.recipientEmail}` : ""}
        </p>
      ) : null}

      <p className="mt-3 text-sm text-lokala-muted">
        Delivered as Lokala credit to your recipient&apos;s account, spendable at
        participating local businesses.
      </p>

      <div className="mt-6 space-y-4 text-lokala-text">
        <div className="flex justify-between">
          <span>Gift certificate</span>
          <span className="font-bold">{amountLabel}</span>
        </div>
        <div className="flex justify-between text-lokala-muted">
          <span>Lokala processing fee</span>
          <span>{feeLabel}</span>
        </div>

        <div className="border-t border-lokala-border pt-4">
          <div className="flex items-end justify-between">
            <span className="text-lg font-extrabold text-lokala-brown-dark">
              Total
            </span>
            <span className="text-4xl font-extrabold text-lokala-green-dark">
              {totalLabel}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
