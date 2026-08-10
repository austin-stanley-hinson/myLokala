import type Stripe from "stripe";

import { logPaymentFailure } from "@/lib/payments/http";
import { readinessPatchFromStripeAccount } from "@/lib/stripe/connect-readiness";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/stripe/connect/webhook — Connect account status synchronizer.
 *
 * Separate from /api/stripe/webhook (PaymentIntent ledger). Uses its own
 * signing secret so Dashboard destinations and event filters stay isolated.
 *
 * Handles account.updated by refreshing business_payment_accounts readiness
 * flags from Stripe's authoritative Account object. Unrelated Connect event
 * types are acknowledged without side effects.
 */

function ack(detail: string): Response {
  return new Response(JSON.stringify({ received: true, detail }), {
    status: 200,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

function retryLater(detail: string): Response {
  return new Response(JSON.stringify({ error: detail }), {
    status: 500,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    logPaymentFailure("connect.webhook", "missing_webhook_secret");
    return retryLater("not configured");
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    logPaymentFailure("connect.webhook", "missing_signature");
    return new Response("missing signature", { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    logPaymentFailure("connect.webhook", "invalid_signature", err);
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type !== "account.updated") {
    return ack("event type not handled");
  }

  if (event.data.object.object !== "account") {
    logPaymentFailure("connect.webhook", "unexpected_object_type", {
      object: event.data.object.object,
    });
    return ack("unexpected object type");
  }

  const account = event.data.object as Stripe.Account;
  const patch = readinessPatchFromStripeAccount(account, event.livemode);
  const admin = createAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from("business_payment_accounts")
    .select("owner_id")
    .eq("stripe_account_id", account.id)
    .maybeSingle<{ owner_id: string }>();

  if (lookupError) {
    logPaymentFailure("connect.webhook", "lookup_failed", lookupError);
    return retryLater("could not look up payment account");
  }

  if (!existing) {
    // Not a Lokala connected account we track (or already replaced). Ack so
    // Stripe stops retrying — nothing for us to update.
    console.info("[connect.webhook] account_not_tracked", {
      eventType: event.type,
    });
    return ack("account not tracked");
  }

  const { error: updateError } = await admin
    .from("business_payment_accounts")
    .update({
      charges_enabled: patch.charges_enabled,
      payouts_enabled: patch.payouts_enabled,
      details_submitted: patch.details_submitted,
      onboarding_status: patch.onboarding_status,
    })
    .eq("stripe_account_id", account.id);

  if (updateError) {
    logPaymentFailure("connect.webhook", "update_failed", updateError);
    return retryLater("could not update payment account");
  }

  console.info("[connect.webhook] account_synced", {
    eventType: event.type,
    onboardingStatus: patch.onboarding_status,
  });

  return ack("account readiness updated");
}
