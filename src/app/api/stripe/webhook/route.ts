import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPaymentFailure } from "@/lib/payments/http";
import {
  advanceTransaction,
  findTransactionForIntent,
  patchForStatus,
  resolveSettlement,
  statusForEventType,
} from "@/lib/payments/webhook";

/**
 * POST /api/stripe/webhook — the authoritative finalizer for every Lokala
 * payment, of both kinds.
 *
 * This route, and only this route, may move a payment to a terminal state or
 * issue Lokala credit. The browser is never trusted to report a payment: it can
 * close its tab, lose its network, or lie.
 *
 * Raw body handling: the signature is computed over the exact bytes Stripe
 * sent, so `req.text()` must be the first thing that touches the body. In the
 * App Router there is no bodyParser to disable. This runs on the Node runtime
 * (the default) because signature verification needs Node crypto -- do not move
 * it to the edge.
 *
 * Idempotency: every event is claimed by inserting its `stripe_event_id`, which
 * is the primary key of `stripe_webhook_events`. A duplicate delivery conflicts
 * and returns 200 immediately without reprocessing. Status transitions are
 * additionally monotonic in both this handler and a database trigger, so even a
 * reprocessed event cannot regress a settled payment.
 *
 * Retry behavior: 400 for a bad signature (never retryable), 200 for anything
 * we have handled or deliberately ignore, and 500 only when a retry could
 * plausibly succeed -- which is the one case where we want Stripe to back off
 * and redeliver.
 */

/** Return 200 so Stripe stops retrying, without implying we changed anything. */
function ack(detail: string): Response {
  return new Response(JSON.stringify({ received: true, detail }), {
    status: 200,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Ask Stripe to retry later. Used only for transient database failures. */
function retryLater(detail: string): Response {
  return new Response(JSON.stringify({ error: detail }), {
    status: 500,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logPaymentFailure("webhook", "missing_webhook_secret");
    return retryLater("not configured");
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    logPaymentFailure("webhook", "missing_signature");
    return new Response("missing signature", { status: 400 });
  }

  // MUST be first: the signature covers these exact bytes.
  const rawBody = await req.text();

  let event: Stripe.Event;
  const stripe = getStripe();
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    // Unsigned or tampered payload. Never retryable, and never echoed back.
    logPaymentFailure("webhook", "invalid_signature", err);
    return new Response("invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  // Claim the event. A conflict means we have already seen it.
  const { error: claimError } = await admin.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
  });

  if (claimError) {
    if (claimError.code === "23505") {
      return ack("duplicate event ignored");
    }
    logPaymentFailure("webhook", "claim_failed", claimError);
    return retryLater("could not record event");
  }

  const targetStatus = statusForEventType(event.type);
  if (!targetStatus) {
    await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);
    return ack("event type not handled");
  }

  const intent = event.data.object as Stripe.PaymentIntent;

  try {
    const transaction = await findTransactionForIntent(admin, intent);

    if (!transaction) {
      // A PaymentIntent with no ledger row: created before this system existed,
      // or created outside it. Retrying will not help, so record why and ack.
      logPaymentFailure("webhook", "transaction_not_found", {
        eventType: event.type,
      });
      await admin
        .from("stripe_webhook_events")
        .update({
          processed_at: new Date().toISOString(),
          process_error: "no matching payment_transaction",
        })
        .eq("stripe_event_id", event.id);
      return ack("no matching transaction");
    }

    const patch = patchForStatus(targetStatus, intent);

    // Record what Stripe actually kept, once the charge has settled.
    if (targetStatus === "succeeded") {
      const { chargeId, stripeFeeCents } = await resolveSettlement(stripe, intent);
      if (chargeId) patch.stripe_charge_id = chargeId;
      if (stripeFeeCents !== null) patch.stripe_fee_cents = stripeFeeCents;
    }

    const { applied, error: updateError } = await advanceTransaction(
      admin,
      transaction.id,
      patch,
    );

    if (updateError) {
      // Transient: leave processed_at null so the unprocessed-event alarm sees
      // it, and let Stripe redeliver.
      logPaymentFailure("webhook", "ledger_update_failed", updateError);
      await admin
        .from("stripe_webhook_events")
        .update({
          payment_transaction_id: transaction.id,
          process_error: "ledger update failed",
        })
        .eq("stripe_event_id", event.id);
      return retryLater("could not update ledger");
    }

    // Issue credit ONLY here, and only for a verified successful payment. The
    // RPC is idempotent (a partial unique index allows one credit per gift), so
    // a reprocessed event cannot double-credit.
    if (
      targetStatus === "succeeded" &&
      transaction.kind === "gift_certificate_purchase"
    ) {
      const { error: deliverError } = await admin.rpc("deliver_gift_certificate", {
        p_payment_intent_id: intent.id,
      });

      if (deliverError) {
        logPaymentFailure("webhook", "gift_delivery_failed", deliverError);
        await admin
          .from("stripe_webhook_events")
          .update({
            payment_transaction_id: transaction.id,
            process_error: "gift delivery failed",
          })
          .eq("stripe_event_id", event.id);
        // The payment is recorded as succeeded; only delivery failed. Retry so
        // the recipient is credited.
        return retryLater("could not deliver gift certificate");
      }
    }

    await admin
      .from("stripe_webhook_events")
      .update({
        payment_transaction_id: transaction.id,
        processed_at: new Date().toISOString(),
      })
      .eq("stripe_event_id", event.id);

    return ack(applied ? "ledger updated" : "already in a terminal state");
  } catch (error) {
    logPaymentFailure("webhook", "unhandled_error", error);
    return retryLater("unhandled error");
  }
}
