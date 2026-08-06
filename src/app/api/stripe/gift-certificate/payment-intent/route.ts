import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { resolveApiUserId } from "@/lib/auth/api-user";
import { createPayment } from "@/lib/payments/create-payment";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * DEPRECATED — create a PaymentIntent for a gift-certificate purchase.
 * Superseded by POST /api/payments with kind "gift_certificate_purchase", which
 * the web checkout now uses.
 *
 * It is kept only so any remaining caller keeps working, and it now delegates to
 * the durable payment service rather than calling Stripe itself. That matters
 * because the previous implementation created a charge and a gift_certificates
 * row with no `payment_transactions` row at all, which meant a live money path
 * that bypassed the ledger and could never be finalized by the webhook.
 *
 * Two limitations are inherent to the old contract:
 *   * `amount` arrives as dollars and is converted here; /api/payments takes
 *     integer cents and never has to round.
 *   * No clientRequestId is accepted, so one is generated per request and a
 *     network retry starts a new attempt instead of resuming the existing one.
 *     Only /api/payments is retry-safe.
 *
 * Fees are computed server-side by the fee engine; anything a caller sends for
 * a fee or total is ignored.
 */
export async function POST(req: Request) {
  try {
    const { amount, recipientEmail, recipientName, note, paymentMethod } =
      await req.json();

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "A positive gift amount is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (typeof recipientEmail !== "string" || !EMAIL_RE.test(recipientEmail.trim())) {
      return NextResponse.json(
        { error: "A valid recipient email is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await createPayment({
      kind: "gift_certificate_purchase",
      clientRequestId: randomUUID(),
      subtotalCents: Math.round(amount * 100),
      paymentMethod: paymentMethod === "bank" ? "ach" : "card",
      recipient: {
        email: recipientEmail.trim(),
        name: typeof recipientName === "string" ? recipientName : null,
        note: typeof note === "string" ? note : null,
      },
      customerId: await resolveApiUserId(req),
    });

    if (!result.ok) {
      // Keep Stripe/Postgres detail on the server; the client gets generic copy.
      console.error(
        "Gift Certificate Payment Intent Error:",
        result.failure.category,
        result.failure.detail ?? "",
      );
      return NextResponse.json(
        { error: "Could not start gift checkout. Please try again." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        clientSecret: result.session.clientSecret,
        paymentId: result.session.paymentId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Gift Certificate Payment Intent Error:", error);
    return NextResponse.json(
      { error: "Could not start gift checkout. Please try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
