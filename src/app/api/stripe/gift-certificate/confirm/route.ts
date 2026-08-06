import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";

/**
 * Report the status of a gift-certificate purchase. READ-ONLY.
 *
 * This route used to issue Lokala credit by calling deliver_gift_certificate()
 * once it saw a succeeded PaymentIntent. It no longer moves money at all:
 * delivery is now owned exclusively by the signature-verified Stripe webhook at
 * /api/stripe/webhook, and the RPC's anon/authenticated grants have been
 * revoked, so credit cannot be issued from a browser-driven call even if one
 * were replayed.
 *
 * Kept only so the existing checkout can poll for a result while the webhook
 * lands. It is superseded by GET /api/payments/[paymentId], which returns the
 * canonical ledger status rather than reading Stripe directly.
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

    if (paymentIntent.metadata?.kind !== "gift_certificate") {
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
    // Keep Stripe/Postgres detail on the server; the client gets generic copy.
    console.error("Gift Certificate Confirm Error:", error);
    return NextResponse.json(
      { error: "Could not read the payment status. Please try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
