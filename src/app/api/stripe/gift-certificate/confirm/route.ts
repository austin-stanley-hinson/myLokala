import { NextResponse } from "next/server";

import { isGiftCertificatePaymentKind } from "@/lib/payments/gift-metadata";
import { getStripe } from "@/lib/stripe/server";

/**
 * DEPRECATED — read-only status probe for a gift-certificate PaymentIntent.
 *
 * Credit is issued only by the signature-verified webhook at /api/stripe/webhook.
 * Canonical client status is GET /api/payments/[paymentId]. This route remains
 * so any leftover caller can still poll Stripe status without moving money.
 *
 * Accepts both historical metadata.kind values:
 *   - gift_certificate_purchase (current createPayment metadata)
 *   - gift_certificate (legacy)
 */
export async function POST(req: Request) {
  try {
    const { paymentIntentId } = await req.json();

    if (typeof paymentIntentId !== "string" || paymentIntentId.trim() === "") {
      return NextResponse.json(
        { error: "paymentIntentId is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!isGiftCertificatePaymentKind(paymentIntent.metadata?.kind)) {
      return NextResponse.json(
        { error: "Not a gift certificate payment." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Status only. Delivery and crediting happen in the webhook; a 'succeeded'
    // answer here means Stripe took the payment, not that credit was issued.
    return NextResponse.json(
      { status: paymentIntent.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Gift Certificate Confirm Error:", error);
    return NextResponse.json(
      { error: "Could not read the payment status. Please try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
