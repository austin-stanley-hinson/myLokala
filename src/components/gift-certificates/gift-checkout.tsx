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

export type GiftPurchase = {
  amount: number;
  recipientName: string;
  recipientEmail: string;
  note: string;
  paymentMethod: "card" | "bank";
  processingFee: number;
  total: number;
};

const stripePromise = getStripePromise();

/**
 * Gift-certificate checkout. Creates a PaymentIntent for the purchase, mounts
 * Stripe Elements, and confirms the payment — card details go straight from the
 * browser to Stripe, never through our server. On success the gift is delivered
 * as Lokala credit to the recipient.
 */
export function GiftCheckout({
  purchase,
  onBack,
}: {
  purchase: GiftPurchase;
  onBack: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const requested = useRef(false);

  // Create the PaymentIntent once when the checkout opens.
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/gift-certificate/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: purchase.amount,
            recipientEmail: purchase.recipientEmail,
            recipientName: purchase.recipientName,
            note: purchase.note,
            paymentMethod: purchase.paymentMethod,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not start checkout.");
        }
        if (!cancelled) setClientSecret(data.clientSecret);
      } catch (err) {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : "Could not start checkout.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purchase]);

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
              {initError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {initError}
                </p>
              ) : !clientSecret ? (
                <p className="text-sm text-lokala-muted">Loading secure checkout…</p>
              ) : (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: { theme: "flat", variables: { colorPrimary: "#2f7d4f" } },
                  }}
                >
                  <CheckoutForm purchase={purchase} />
                </Elements>
              )}
            </div>
          </section>

          <PurchaseSummary purchase={purchase} />
        </div>
      </div>
    </section>
  );
}

function CheckoutForm({ purchase }: { purchase: GiftPurchase }) {
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"delivered" | "paid" | null>(null);

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

    // Payment succeeded — ask the server to verify and deliver the credit.
    try {
      const res = await fetch("/api/stripe/gift-certificate/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not finalize your gift.");
      }
      setResult(data.status === "delivered" ? "delivered" : "paid");
    } catch (err) {
      // The charge went through; delivery just needs a retry/claim.
      setError(
        err instanceof Error
          ? `Payment succeeded, but delivery needs attention: ${err.message}`
          : "Payment succeeded, but delivery needs attention.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border border-lokala-green bg-lokala-green-soft px-5 py-6">
        <p className="text-lg font-extrabold text-lokala-brown-dark">
          🎉 Payment complete
        </p>
        <p className="mt-2 text-sm leading-6 text-lokala-brown">
          {result === "delivered"
            ? `${currency(purchase.amount)} in Lokala credit was delivered to ${
                purchase.recipientName || purchase.recipientEmail
              }.`
            : `We received your payment. ${
                purchase.recipientName || "Your recipient"
              } will get ${currency(
                purchase.amount,
              )} in Lokala credit as soon as they sign in to their Lokala account.`}
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
        {submitting ? "Processing…" : `Pay ${currency(purchase.total)}`}
      </button>
    </form>
  );
}

function PurchaseSummary({ purchase }: { purchase: GiftPurchase }) {
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
          <span className="font-bold">{currency(purchase.amount)}</span>
        </div>
        <div className="flex justify-between text-lokala-muted">
          <span>Lokala processing fee</span>
          <span>{currency(purchase.processingFee)}</span>
        </div>

        <div className="border-t border-lokala-border pt-4">
          <div className="flex items-end justify-between">
            <span className="text-lg font-extrabold text-lokala-brown-dark">
              Total
            </span>
            <span className="text-4xl font-extrabold text-lokala-green-dark">
              {currency(purchase.total)}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
