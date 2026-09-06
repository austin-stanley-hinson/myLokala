"use client";

import { useState } from "react";

import { CustomerAuthPanel } from "@/components/auth/customer-auth-panel";
import type { GiftClaimPreview } from "./page";

type ClaimPanelProps = {
  rawToken: string;
  preview: GiftClaimPreview;
  initialIsAuthenticated: boolean;
};

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card">
      {children}
    </section>
  );
}

export function ClaimPanel({ rawToken, preview, initialIsAuthenticated }: ClaimPanelProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialIsAuthenticated);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  if (!preview.found) {
    return (
      <Card>
        <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
          Claim link not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          This link doesn&apos;t match a Lokala gift. Double check the link from
          your email, or ask the sender to resend it.
        </p>
      </Card>
    );
  }

  if (preview.status === "expired" || preview.status === "canceled") {
    return (
      <Card>
        <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
          This gift has expired
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          This gift link is no longer active. If you think this is a mistake,
          reach out to whoever sent it to you.
        </p>
      </Card>
    );
  }

  if (preview.status === "claimed" || claimed) {
    return (
      <Card>
        <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
          {claimed ? "Gift claimed!" : "Already claimed"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          {claimed
            ? "This Lokala gift balance is now in your account. Spend it at participating local businesses."
            : "This gift has already been claimed."}
        </p>
      </Card>
    );
  }

  const amount = formatAmount(preview.faceValueCents, preview.currency);

  async function handleClaim() {
    setClaimError(null);
    setClaiming(true);
    try {
      const res = await fetch("/api/gifts/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken: rawToken }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setClaimError(data?.error ?? "Could not claim this gift. Please try again.");
        return;
      }
      setClaimed(true);
    } catch {
      setClaimError("Could not reach Lokala. Check your connection and try again.");
    } finally {
      setClaiming(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-lokala-green-dark">
          You&apos;ve received a gift
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          {amount} Lokala balance
        </h1>
        <p className="mt-3 text-sm leading-6 text-lokala-muted">
          Sign in or create a free account to claim it.
        </p>

        <div className="mt-6">
          <CustomerAuthPanel
            returnPath={`/claim/${encodeURIComponent(rawToken)}`}
            onAuthenticated={() => setIsAuthenticated(true)}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-lokala-green-dark">
        You&apos;ve received a gift
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
        {amount} Lokala balance
      </h1>
      <p className="mt-3 text-sm leading-6 text-lokala-muted">
        Spend it at participating local businesses in the Waterville, ME area.
      </p>

      {claimError ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {claimError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleClaim()}
        disabled={claiming}
        className="mt-6 inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {claiming ? "Claiming…" : "Claim your gift"}
      </button>
    </Card>
  );
}
