import Link from "next/link";
import { Receipt } from "lucide-react";

import { getBusinessContext } from "@/lib/auth/business-context";
import { canManageMerchant } from "@/lib/auth/merchant";
import { StripeConnectCard } from "@/components/business/stripe-connect-card";
import { StripeFaqSection } from "@/components/business/stripe-faq-section";
import {
  EMPTY_CONNECT_STATUS,
  parseMerchantConnectStatus,
} from "@/lib/stripe/connect-status";
import { createTypedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BusinessPaymentsPage() {
  const { merchant, role } = await getBusinessContext();
  const canManage = canManageMerchant(role);
  const supabase = await createTypedClient();
  const { data, error } = await supabase.rpc("get_merchant_connect_status", {
    p_merchant_account_id: merchant.id,
  });

  const status = error
    ? EMPTY_CONNECT_STATUS
    : parseMerchantConnectStatus(data);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Payments
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Payout setup
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Connect Stripe so Lokala can settle redeemed gift balance to your
          restaurant. Customers pay Lokala, then redeem at your QR code — you
          do not take a card at the counter.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-lokala-danger/30 bg-lokala-danger/5 px-4 py-3 text-sm text-lokala-danger"
        >
          Payout status could not be loaded. Please refresh and try again.
        </p>
      ) : null}

      <StripeConnectCard status={status} canManage={canManage} />

      <Link
        href="/business/payments/redemptions"
        className="flex items-center justify-between gap-3 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card transition hover:bg-lokala-cream-light"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
            <Receipt className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-bold text-lokala-brown-dark">Recent redemptions</p>
            <p className="text-sm text-lokala-muted">
              Lokala balance payments customers have made at your QR code.
            </p>
          </div>
        </div>
        <span className="text-sm font-bold text-lokala-green-dark">View all &rarr;</span>
      </Link>

      <StripeFaqSection />
    </div>
  );
}
