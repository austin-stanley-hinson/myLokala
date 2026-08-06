import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPaymentFailure } from "@/lib/payments/http";
import {
  claimStripeWebhookEvent,
  markWebhookEventProcessed,
  releaseWebhookEventClaim,
} from "@/lib/payments/webhook-claim";
import {
  advanceTransaction,
  findTransactionForIntent,
  isPaymentIntentLedgerEvent,
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
 * Event handling is branched by type BEFORE casting `event.data.object`:
 *   - payment_intent.* → payment_transactions ledger (+ gift delivery)
 *   - everything else → acknowledged and ignored
 *
 * Raw body handling: the signature is computed over the exact bytes Stripe
 * sent, so `req.text()` must be the first thing that touches the body. In the
 * App Router there is no bodyParser to disable. This runs on the Node runtime
 * (the default) because signature verification needs Node crypto -- do not move
 * it to the edge.
 *
 * Idempotency / retry (claim_stripe_webhook_event):
 *   - processed_at set → 200 already processed (no handler re-run)
 *   - processed_at null + no fresh lease → claim, run handler, then mark
 *     processed or release lease on failure
 *   - processed_at null + fresh lease held by another worker → 500 in progress
 * Ledger / gift transitions remain monotonic/idempotent, so a successful retry
 * cannot regress a settled payment or double-credit a gift.
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

type AdminClient = ReturnType<typeof createAdminClient>;

async function failForRetry(
  admin: AdminClient,
  eventId: string,
  processError: string,
  detail: string,
): Promise<Response> {
  try {
    await releaseWebhookEventClaim(admin, eventId, processError);
  } catch (releaseError) {
    logPaymentFailure("webhook", "release_claim_failed", releaseError);
  }
  return retryLater(detail);
}

async function handlePaymentIntentEvent(params: {
  admin: AdminClient;
  stripe: Stripe;
  event: Stripe.Event;
}): Promise<Response> {
  const { admin, stripe, event } = params;
  const targetStatus = statusForEventType(event.type);
  if (!targetStatus) {
    await markWebhookEventProcessed(admin, event.id);
    return ack("event type not handled");
  }

  if (event.data.object.object !== "payment_intent") {
    logPaymentFailure("webhook", "unexpected_object_type", {
      eventType: event.type,
      object: event.data.object.object,
    });
    await markWebhookEventProcessed(admin, event.id, {
      process_error: "unexpected object type for payment_intent event",
    });
    return ack("unexpected object type");
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
      await markWebhookEventProcessed(admin, event.id, {
        process_error: "no matching payment_transaction",
      });
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
      logPaymentFailure("webhook", "ledger_update_failed", updateError);
      await admin
        .from("stripe_webhook_events")
        .update({ payment_transaction_id: transaction.id })
        .eq("stripe_event_id", event.id);
      return failForRetry(
        admin,
        event.id,
        "ledger update failed",
        "could not update ledger",
      );
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
          .update({ payment_transaction_id: transaction.id })
          .eq("stripe_event_id", event.id);
        return failForRetry(
          admin,
          event.id,
          "gift delivery failed",
          "could not deliver gift certificate",
        );
      }
    }

    await markWebhookEventProcessed(admin, event.id, {
      payment_transaction_id: transaction.id,
    });

    return ack(applied ? "ledger updated" : "already in a terminal state");
  } catch (error) {
    logPaymentFailure("webhook", "unhandled_error", error);
    return failForRetry(admin, event.id, "unhandled error", "unhandled error");
  }
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

  let claim;
  try {
    claim = await claimStripeWebhookEvent(admin, {
      stripeEventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
    });
  } catch (claimError) {
    logPaymentFailure("webhook", "claim_failed", claimError);
    return retryLater("could not record event");
  }

  if (claim.status === "already_processed") {
    console.info("[webhook] duplicate_completed_event", {
      eventType: event.type,
      attemptCount: claim.attemptCount,
    });
    return ack("duplicate event ignored");
  }

  if (claim.status === "in_progress") {
    console.info("[webhook] concurrent_claim_in_progress", {
      eventType: event.type,
      attemptCount: claim.attemptCount,
    });
    return retryLater("event processing in progress");
  }

  if (claim.attemptCount > 1) {
    console.info("[webhook] retry_claim", {
      eventType: event.type,
      attemptCount: claim.attemptCount,
    });
  }

  // Branch by event family before casting event.data.object.
  if (isPaymentIntentLedgerEvent(event.type)) {
    return handlePaymentIntentEvent({ admin, stripe, event });
  }

  await markWebhookEventProcessed(admin, event.id);
  return ack("event type not handled");
}
