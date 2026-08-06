import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Confirm a gift-certificate purchase and trigger delivery.
 *
 * This route is the SECURITY GATE for crediting: it retrieves the PaymentIntent
 * from Stripe and only proceeds if it actually succeeded. Because the browser
 * cannot be trusted to report a real payment, delivery/credit only happens
 * here, server-side, after Stripe confirms.
 *
 * NOTE (harden before go-live): this should become a Stripe webhook with
 * signature verification so delivery survives the user closing the tab and
 * can't be spoofed. See the migration header for the same note.
 */
export async function POST(req: Request) {
  try {
    const { paymentIntentId } = await req.json();

    if (typeof paymentIntentId !== "string" || paymentIntentId.trim() === "") {
      return NextResponse.json(
        { error: "paymentIntentId is required." },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata?.kind !== "gift_certificate") {
      return NextResponse.json(
        { error: "Not a gift certificate payment." },
        { status: 400 },
      );
    }

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: "Payment has not completed.", status: paymentIntent.status },
        { status: 402 },
      );
    }

    // Payment verified — deliver (idempotent). Returns 'delivered' if the
    // recipient has an account and was credited, or 'paid' if they still need
    // to sign up (claimed later via claim_pending_gift_certificates).
    const supabase = await createClient();
    const { data: status, error } = await supabase.rpc("deliver_gift_certificate", {
      p_payment_intent_id: paymentIntentId,
    });

    if (error) {
      throw new Error(`Could not deliver gift certificate: ${error.message}`);
    }

    return NextResponse.json({ status });
  } catch (error) {
    // Keep Stripe/Postgres detail on the server; the client gets generic copy.
    console.error("Gift Certificate Confirm Error:", error);
    return NextResponse.json(
      { error: "Could not confirm gift checkout. Please try again." },
      { status: 400 },
    );
  }
}
