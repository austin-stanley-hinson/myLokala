"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { CustomerAuthPanel } from "@/components/auth/customer-auth-panel";
import type { ResolvedPaymentHub } from "@/lib/merchant/setup";
import type { RedemptionConfirmation } from "@/lib/payments/redeem-balance";

function formatAmount(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** Keyed only by publicCode (not amount) and cleared on success: a network
 * retry of an in-flight redemption reuses the id and safely replays
 * redeem_lokala_balance's own idempotency, but the NEXT distinct redemption
 * (same or different amount, e.g. "Redeem again") always gets a fresh id --
 * unlike keying by amount too (buy-balance-panel.tsx's attemptRequestId
 * pattern), which would make a second, legitimate same-amount redemption
 * silently replay the first instead of charging again. */
function attemptRequestId(publicCode: string): string {
  const key = `lokala.redeem.crid.${publicCode}`;
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

function clearAttemptRequestId(publicCode: string): void {
  try {
    window.sessionStorage.removeItem(`lokala.redeem.crid.${publicCode}`);
  } catch {
    // Best-effort only -- a leftover key just means the next attempt at this
    // exact publicCode would need a manual reload to rotate, not a hazard.
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card">
      {children}
    </section>
  );
}

export function RedeemPanel({
  hub,
  initialIsAuthenticated,
}: {
  hub: ResolvedPaymentHub;
  initialIsAuthenticated: boolean;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialIsAuthenticated);
  const [confirmation, setConfirmation] = useState<RedemptionConfirmation | null>(null);

  if (!isAuthenticated) {
    return (
      <Card>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-lokala-green-dark">
          Pay with Lokala
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          {hub.merchantDisplayName}
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          Sign in or create a free account to redeem Lokala balance here.
        </p>
        <div className="mt-6">
          <CustomerAuthPanel
            returnPath={`/pay/${encodeURIComponent(hub.publicCode)}`}
            onAuthenticated={() => setIsAuthenticated(true)}
          />
        </div>
      </Card>
    );
  }

  if (confirmation) {
    return <RedemptionConfirmationCard hub={hub} confirmation={confirmation} />;
  }

  return <RedeemForm hub={hub} onConfirmed={setConfirmation} />;
}

function RedeemForm({
  hub,
  onConfirmed,
}: {
  hub: ResolvedPaymentHub;
  onConfirmed: (confirmation: RedemptionConfirmation) => void;
}) {
  const [subtotal, setSubtotal] = useState("");
  const [tip, setTip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const subtotalDollars = Number(subtotal);
    if (!Number.isFinite(subtotalDollars) || subtotalDollars <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const subtotalCents = Math.round(subtotalDollars * 100);

    const tipDollars = tip.trim() === "" ? 0 : Number(tip);
    if (!Number.isFinite(tipDollars) || tipDollars < 0) {
      setError("Enter a valid tip.");
      return;
    }
    const tipCents = Math.round(tipDollars * 100);

    setLoading(true);
    try {
      const res = await fetch("/api/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicCode: hub.publicCode,
          subtotalCents,
          tipCents,
          clientRequestId: attemptRequestId(hub.publicCode),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not complete this redemption.");
      }
      clearAttemptRequestId(hub.publicCode);
      onConfirmed(data as RedemptionConfirmation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete this redemption.");
    } finally {
      setLoading(false);
    }
  }

  const subtotalDollars = Number(subtotal);
  const tipDollars = tip.trim() === "" ? 0 : Number(tip);
  const totalPreview =
    Number.isFinite(subtotalDollars) && subtotalDollars > 0 && Number.isFinite(tipDollars) && tipDollars >= 0
      ? formatAmount(Math.round((subtotalDollars + tipDollars) * 100))
      : null;

  return (
    <Card>
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-lokala-green-dark">
        Pay with Lokala
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
        {hub.merchantDisplayName}
      </h1>
      <p className="mt-1 text-sm font-semibold text-lokala-muted">
        {hub.locationLabel ?? "Waterville, ME"}
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="subtotal" className="text-sm font-medium">
            Amount (USD)
          </label>
          <input
            id="subtotal"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tip" className="text-sm font-medium">
            Tip (optional)
          </label>
          <input
            id="tip"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {totalPreview ? (
          <p className="text-sm text-lokala-muted">
            Total to redeem: <span className="font-bold text-lokala-brown-dark">{totalPreview}</span>
          </p>
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
          {loading ? "Confirming…" : "Confirm redemption"}
        </button>
      </form>
    </Card>
  );
}

function RedemptionConfirmationCard({
  hub,
  confirmation,
}: {
  hub: ResolvedPaymentHub;
  confirmation: RedemptionConfirmation;
}) {
  return (
    <Card>
      <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
        🎉 {formatAmount(confirmation.balanceDebitedCents, confirmation.currency)} redeemed
      </h1>
      <p className="mt-3 text-sm leading-6 text-lokala-muted">
        Paid to <span className="font-semibold text-lokala-brown-dark">{confirmation.merchantDisplayName}</span>.
      </p>

      <dl className="mt-6 flex flex-col gap-3 rounded-2xl border border-lokala-border bg-lokala-cream-light px-4 py-4 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-lokala-muted">Confirmation code</dt>
          <dd className="font-mono font-bold text-lokala-brown-dark">{confirmation.confirmationCode}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-lokala-muted">Subtotal</dt>
          <dd className="font-semibold text-lokala-brown-dark">
            {formatAmount(confirmation.subtotalCents, confirmation.currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-lokala-muted">Tip</dt>
          <dd className="font-semibold text-lokala-brown-dark">
            {formatAmount(confirmation.tipCents, confirmation.currency)}
          </dd>
        </div>
        {confirmation.remainingWalletBalanceCents !== null ? (
          <div className="flex items-center justify-between border-t border-lokala-border pt-3">
            <dt className="text-lokala-muted">Remaining Lokala balance</dt>
            <dd className="font-bold text-lokala-green-dark">
              {formatAmount(confirmation.remainingWalletBalanceCents, confirmation.currency)}
            </dd>
          </div>
        ) : null}
      </dl>

      {confirmation.idempotent ? (
        <p className="mt-4 text-xs font-semibold text-lokala-muted">
          This redemption was already confirmed — showing your original receipt.
        </p>
      ) : null}

      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
      >
        Back to Lokala
      </Link>
      <Link
        href={`/pay/${encodeURIComponent(hub.publicCode)}`}
        className="mt-3 inline-flex rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
      >
        Redeem again
      </Link>
    </Card>
  );
}
