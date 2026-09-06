"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { CustomerAuthPanel } from "@/components/auth/customer-auth-panel";
import { getStripePromise } from "@/lib/stripe/client";
import type { BalancePurchaseSession } from "@/lib/payments/create-balance-purchase";

const stripePromise = getStripePromise();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Poll cadence for the status endpoint after Stripe confirms the charge.
 * Bounded: 20 attempts * 3s = 60s, then the UI stops polling and tells the
 * customer to check back rather than spinning forever. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

function attemptRequestId(subtotalCents: number, recipientEmail: string): string {
  const key = `lokala.balance.crid.${subtotalCents}.${recipientEmail.trim().toLowerCase()}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card">
      {children}
    </section>
  );
}

export function BuyBalancePanel({ initialIsAuthenticated }: { initialIsAuthenticated: boolean }) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialIsAuthenticated);
  const [session, setSession] = useState<BalancePurchaseSession | null>(null);

  if (!isAuthenticated) {
    return (
      <Card>
        <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
          Buy Lokala balance
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          Sign in or create a free account to buy Lokala gift balance for
          yourself, or send it as a gift.
        </p>
        <div className="mt-6">
          <CustomerAuthPanel
            returnPath="/buy-balance"
            onAuthenticated={() => setIsAuthenticated(true)}
          />
        </div>
      </Card>
    );
  }

  if (!session?.clientSecret) {
    return <PurchaseForm onStarted={setSession} />;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: session.clientSecret,
        appearance: { theme: "flat", variables: { colorPrimary: "#2f7d4f" } },
      }}
    >
      <CheckoutAndPoll session={session} />
    </Elements>
  );
}

function PurchaseForm({
  onStarted,
}: {
  onStarted: (session: BalancePurchaseSession) => void;
}) {
  const [amount, setAmount] = useState("25");
  const [isGift, setIsGift] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const subtotalCents = Math.round(dollars * 100);

    const trimmedEmail = recipientEmail.trim();
    if (isGift && !EMAIL_RE.test(trimmedEmail)) {
      setError("Enter a valid recipient email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/balance-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: attemptRequestId(subtotalCents, isGift ? trimmedEmail : "self"),
          subtotalCents,
          ...(isGift ? { recipientEmail: trimmedEmail } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not start checkout.");
      }
      onStarted(data as BalancePurchaseSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
        Buy Lokala balance
      </h1>
      <p className="mt-2 text-sm leading-6 text-lokala-muted">
        Load balance to spend at participating local businesses, for yourself
        or as a gift.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className="text-sm font-medium">
            Amount (USD)
          </label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-lokala-border bg-lokala-cream-light px-4 py-3">
          <input
            type="checkbox"
            checked={isGift}
            onChange={(e) => setIsGift(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm font-semibold text-lokala-brown-dark">
            Send this as a gift
          </span>
        </label>

        {isGift ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="recipientEmail" className="text-sm font-medium">
              Recipient email
            </label>
            <input
              id="recipientEmail"
              type="email"
              autoComplete="email"
              required={isGift}
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-lokala-muted">
              We&apos;ll email them a claim link. They don&apos;t need a Lokala
              account yet.
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-full bg-lokala-green px-5 py-3 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Starting checkout…" : "Continue to payment"}
        </button>
      </form>
    </Card>
  );
}

type PollOutcome = "pending" | "succeeded" | "failed" | "timed_out";

function CheckoutAndPoll({ session }: { session: BalancePurchaseSession }) {
  const stripe = useStripe();
  const elements = useElements();

  const [phase, setPhase] = useState<"paying" | "polling" | "done">("paying");
  const [payError, setPayError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<PollOutcome>("pending");

  async function pollStatus(): Promise<void> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      try {
        const res = await fetch(`/api/balance-purchases/${session.orderId}`, {
          method: "GET",
        });
        if (res.ok) {
          const data = (await res.json()) as { status?: string };
          if (data.status === "paid") {
            setOutcome("succeeded");
            setPhase("done");
            return;
          }
          if (
            data.status === "failed" ||
            data.status === "canceled" ||
            data.status === "refunded" ||
            data.status === "disputed"
          ) {
            setOutcome("failed");
            setPhase("done");
            return;
          }
        }
      } catch {
        // Transient network error -- keep polling until MAX_POLL_ATTEMPTS.
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    // Gave up without ever reaching a terminal status -- never spin forever.
    setOutcome("timed_out");
    setPhase("done");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setPayError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setPayError(confirmError.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status !== "succeeded") {
      setPayError("Payment did not complete. Please try again.");
      setSubmitting(false);
      return;
    }

    setPhase("polling");
    void pollStatus();
  }

  if (phase === "done") {
    if (outcome === "succeeded") {
      return (
        <Card>
          <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
            🎉 Balance added
          </h1>
          <p className="mt-3 text-sm leading-6 text-lokala-muted">
            {session.purchaseKind === "gift"
              ? `${formatAmount(session.subtotalCents)} was sent as a gift. We emailed the recipient a claim link.`
              : `${formatAmount(session.subtotalCents)} was added to your Lokala balance.`}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
          >
            Back to Lokala
          </Link>
        </Card>
      );
    }

    if (outcome === "failed") {
      return (
        <Card>
          <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
            Payment didn&apos;t go through
          </h1>
          <p className="mt-3 text-sm leading-6 text-lokala-muted">
            Your card was not charged successfully. No balance was added. You
            can try again with a different card.
          </p>
          <Link
            href="/buy-balance"
            className="mt-6 inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
          >
            Try again
          </Link>
        </Card>
      );
    }

    // timed_out
    return (
      <Card>
        <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
          Still processing
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          Your payment was received and is still being processed. This can take
          a few minutes. You can safely close this page — refresh it later to
          check.
        </p>
      </Card>
    );
  }

  if (phase === "polling") {
    return (
      <Card>
        <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
          Confirming your payment…
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          This only takes a moment.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-2xl font-extrabold text-lokala-brown-dark">
        Payment details
      </h2>
      <p className="mt-1 text-sm text-lokala-muted">
        Pay securely with card. Your card is handled by Stripe and never
        touches our servers.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-5">
        <PaymentElement />
        {payError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {payError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="rounded-full bg-lokala-green px-5 py-3 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Processing…" : `Pay ${formatAmount(session.totalCents)}`}
        </button>
      </form>
    </Card>
  );
}
