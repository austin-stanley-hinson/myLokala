import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { calculateGiftCardTotal } from "@/lib/pricing/gift-card-fees";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create a PaymentIntent for a gift-certificate purchase.
 *
 * This is a PLATFORM charge (no transfer_data) — the money becomes spendable
 * Lokala credit for the recipient, not a payout to a business. A pending
 * gift_certificates row is recorded; it is delivered/credited only after the
 * payment is confirmed (see the sibling /confirm route).
 *
 * TEMPORARY: delivery currently depends on the browser calling /confirm after
 * Stripe succeeds, so a closed tab leaves the gift undelivered. A
 * signature-verified Stripe webhook will replace that path and become the only
 * way credit is issued.
 */
export async function POST(req: Request) {
  try {
    const { amount, recipientEmail, recipientName, note, paymentMethod } =
      await req.json();

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "A positive gift amount is required." },
        { status: 400 },
      );
    }

    if (typeof recipientEmail !== "string" || !EMAIL_RE.test(recipientEmail.trim())) {
      return NextResponse.json(
        { error: "A valid recipient email is required." },
        { status: 400 },
      );
    }

    // Fee math is shared with the UI so the customer is charged exactly what
    // they were shown.
    const method = paymentMethod === "bank" ? "bank" : "card";
    const { amount: giftAmount, consumerFee, total } = calculateGiftCardTotal(
      amount,
      { paymentMethod: method },
    );

    const amountCents = Math.round(giftAmount * 100);
    const feeCents = Math.round(consumerFee * 100);
    const totalCents = Math.round(total * 100);

    const stripe = getStripe();

    // No transfer_data: the charge lands on the platform account and funds the
    // recipient's Lokala credit.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      // allow_redirects: "never" keeps checkout to inline methods (card) so the
      // whole flow stays on-page — no redirect-return handling needed.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        kind: "gift_certificate",
        recipient_email: recipientEmail.trim(),
        amount_cents: String(amountCents),
        fee_cents: String(feeCents),
      },
    });

    // Record the pending gift (SECURITY DEFINER RPC — buyer_id is the caller,
    // or null for a guest checkout).
    const supabase = await createClient();
    const { data: giftId, error } = await supabase.rpc("create_gift_certificate", {
      p_recipient_email: recipientEmail.trim(),
      p_recipient_name: typeof recipientName === "string" ? recipientName : null,
      p_amount_cents: amountCents,
      p_fee_cents: feeCents,
      p_total_cents: totalCents,
      p_note: typeof note === "string" ? note : null,
      p_payment_method: method,
      p_stripe_payment_intent_id: paymentIntent.id,
    });

    if (error) {
      throw new Error(`Could not record gift certificate: ${error.message}`);
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      giftCertificateId: giftId,
    });
  } catch (error) {
    // Keep Stripe/Postgres detail on the server; the client gets generic copy.
    console.error("Gift Certificate Payment Intent Error:", error);
    return NextResponse.json(
      { error: "Could not start gift checkout. Please try again." },
      { status: 400 },
    );
  }
}
