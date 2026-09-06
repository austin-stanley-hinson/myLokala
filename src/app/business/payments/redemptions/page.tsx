import Link from "next/link";
import { Receipt } from "lucide-react";

import { getBusinessContext } from "@/lib/auth/business-context";
import { createTypedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Read-only for MVP -- no export/search yet, no reversed/disputed handling
 * beyond showing the status. RLS (balance_redemptions_select_merchant, via
 * is_merchant_member) is what actually scopes this to the signed-in
 * merchant's own account; the .eq() below is belt-and-suspenders, not the
 * real authorization boundary. */
const RECENT_REDEMPTIONS_LIMIT = 50;

type RedemptionRow = {
  id: string;
  confirmation_code: string;
  subtotal_cents: number;
  tip_cents: number;
  balance_debited_cents: number;
  currency: string;
  status: string;
  created_at: string;
  merchant_locations: { label: string } | null;
};

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function BusinessRedemptionsPage() {
  const { merchant } = await getBusinessContext();
  const supabase = await createTypedClient();

  const { data, error } = await supabase
    .from("balance_redemptions")
    .select(
      "id, confirmation_code, subtotal_cents, tip_cents, balance_debited_cents, currency, status, created_at, merchant_locations(label)",
    )
    .eq("merchant_account_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(RECENT_REDEMPTIONS_LIMIT);

  const redemptions = (data ?? []) as unknown as RedemptionRow[];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Payments
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Recent redemptions
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Lokala balance customers have redeemed at your QR code, most recent
          first.
        </p>
        <Link
          href="/business/payments"
          className="mt-3 inline-flex text-sm font-bold text-lokala-green-dark hover:underline"
        >
          &larr; Back to Payments
        </Link>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-lokala-danger/30 bg-lokala-danger/5 px-4 py-3 text-sm text-lokala-danger"
        >
          Redemptions could not be loaded. Please refresh and try again.
        </p>
      ) : redemptions.length === 0 ? (
        <section className="rounded-3xl border border-lokala-border bg-white p-8 text-center shadow-lokala-card">
          <Receipt className="mx-auto size-8 text-lokala-green-dark" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-lokala-brown-dark">
            No redemptions yet
          </p>
          <p className="mt-1 text-sm leading-6 text-lokala-muted">
            Once a customer pays with Lokala balance at your QR code, it will
            show up here.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-lokala-border bg-white shadow-lokala-card">
          <ul className="divide-y divide-lokala-border">
            {redemptions.map((redemption) => (
              <li
                key={redemption.id}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-lokala-brown-dark">
                    {redemption.confirmation_code}
                  </p>
                  <p className="mt-0.5 text-xs text-lokala-muted">
                    {formatTimestamp(redemption.created_at)}
                    {redemption.merchant_locations?.label
                      ? ` · ${redemption.merchant_locations.label}`
                      : ""}
                    {redemption.status !== "completed" ? ` · ${redemption.status}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-extrabold text-lokala-green-dark">
                  {formatAmount(redemption.balance_debited_cents, redemption.currency)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
