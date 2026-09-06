import { generateRawClaimToken, hashClaimToken } from "./claim-token.ts";
import { sendGiftClaimEmailViaResend, type GiftClaimEmailSender } from "./gift-claim-email.ts";
import {
  sendGiftSentConfirmationEmailViaResend,
  type GiftSentConfirmationSender,
} from "./gift-purchaser-email.ts";
import { getUserEmailById, type UserEmailLookupAdmin } from "./user-email.ts";

/**
 * Balance-purchase branch of the platform PaymentIntent webhook. SERVER-ONLY.
 *
 * A balance-purchase PaymentIntent (payment_orders / balance_purchases) is a
 * different system from the legacy payment_transactions ledger that the rest
 * of src/app/api/stripe/webhook/route.ts handles -- looking one up there
 * would never match. This module is dispatched to from that route (see its
 * `intent.metadata.kind === "balance_purchase"` check) and never touches
 * payment_transactions, gift_certificates, or how a gift_certificate_purchase
 * event is processed.
 *
 * Claiming reuses the SAME generic app_private webhook claim/lease RPCs
 * already used for the Connect account.updated handler
 * (service_claim_stripe_webhook_event / service_complete_stripe_webhook_event,
 * app_private.stripe_webhook_events) rather than the legacy
 * public.stripe_webhook_events table that the payment_transactions branch
 * uses. The route's own top-level legacy claim still runs unconditionally for
 * every event first, so a balance-purchase event is deduped twice
 * (legacy table + this one) -- harmless, and this claim is what the "exactly
 * once, even on retry" guarantee for service_issue_balance_purchase is
 * actually tested against here, independent of the legacy bookkeeping.
 *
 * payment_intent.succeeded issues the balance (self path with no recipient
 * email, gift path with one) via service_issue_balance_purchase, which
 * already syncs payment_orders/balance_purchases to paid/delivered/
 * pending_claim itself. processing/failed/canceled events instead sync
 * payment_orders.status and balance_purchases.status here directly (see
 * statusSyncFor) -- neither table has a dedicated enum value matching every
 * Stripe outcome (no 'processing' on payment_orders, no 'failed' on
 * balance_purchases at all), so the mapping is a judgment call, documented
 * inline.
 *
 * Gift claim tokens: a raw token is generated here, hashed for
 * service_issue_balance_purchase, and used ONCE to send the claim email
 * (gift-claim-email.ts) -- never logged, never persisted, never returned.
 * An email-send failure is caught and logged here, never allowed to fail or
 * retry the webhook: the ledger entry and gift_claims row already committed
 * by the time the email is attempted, so a retry could only ever duplicate
 * the send, not fix anything.
 *
 * A second, separate email goes to the PURCHASER for a gift (never for a
 * self-top-up): confirmation that the gift was sent, with the recipient
 * address, amount, and the live claim window read from
 * service_get_gift_claim_expiry_days (not the display-only constant
 * gift-claim-email.ts mirrors for the recipient's email). Looked up and sent
 * in its own try/catch, independent of the recipient email's -- one failing
 * must never suppress or be conflated with the other, and neither may fail
 * or retry the webhook.
 */

export const BALANCE_PURCHASE_WEBHOOK_LEASE_SECONDS = 300;

/** Matches PaymentStatus (webhook.ts) so the caller can pass statusForEventType's
 * result directly. "pending" is never actually produced by statusForEventType
 * for a real event, but is included so the caller doesn't need a cast; this
 * module treats every non-"succeeded" value identically. */
export type BalancePurchaseTargetStatus =
  | "pending"
  | "succeeded"
  | "processing"
  | "failed"
  | "canceled";

export type BalancePurchaseIntentInput = {
  id: string;
  metadata: Record<string, string | undefined>;
};

type RpcResult = PromiseLike<{
  data: unknown;
  error: { message: string; code?: string | number } | null;
}>;

type UpdateResult = PromiseLike<{ error: { message: string } | null }>;

type SelectResult = PromiseLike<{
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}>;

/** The database surface this module needs. The real Supabase admin client
 * (createAdminClient()) already satisfies this shape; tests inject a fake. */
export type BalancePurchaseWebhookAdmin = UserEmailLookupAdmin & {
  rpc: (fn: string, args?: Record<string, unknown>) => RpcResult;
  from: (table: string) => {
    update: (patch: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        in: (column: string, values: string[]) => UpdateResult;
      };
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => SelectResult;
      };
    };
  };
};

/** Structurally matches the real Supabase admin client, but with `.from()`
 * typed as returning `unknown` rather than assignable directly. Checking the
 * real client's `.select()` builder against BalancePurchaseWebhookAdmin's
 * shape directly hits TS2589 (excessively deep instantiation) --
 * supabase-js's PostgrestFilterBuilder generics for `.select()` are
 * considerably deeper than the `.update().eq().in()` chain this module also
 * uses, which does not have this problem on its own. Routing through this
 * adapter keeps the call site (route.ts) using the real client with no
 * unsafe cast at the call site, while only this function's own explicit
 * return-type annotation is checked against BalancePurchaseWebhookAdmin.
 *
 * `unknown` (not `any`) on the parameter type avoids the same deep
 * assignability check at the CALL site (unknown is trivially compatible with
 * any return type, same short-circuit `any` gave us, but still type-checked
 * everywhere else). The two local `as` assertions below, one per shape
 * actually used, narrow it back down where it's called -- an assertion is a
 * much shallower check than a structural assignability comparison, so it
 * doesn't reintroduce the instantiation-depth problem either. */
export function toBalancePurchaseWebhookAdmin(raw: {
  rpc: BalancePurchaseWebhookAdmin["rpc"];
  from: (table: string) => unknown;
  auth: UserEmailLookupAdmin["auth"];
}): BalancePurchaseWebhookAdmin {
  return {
    rpc: raw.rpc,
    from(table) {
      return {
        update(patch) {
          return {
            eq(column, value) {
              return {
                in: (statusColumn: string, allowedValues: string[]) => {
                  const builder = raw.from(table) as {
                    update: (p: Record<string, unknown>) => {
                      eq: (c: string, v: string) => {
                        in: (sc: string, av: string[]) => UpdateResult;
                      };
                    };
                  };
                  return builder.update(patch).eq(column, value).in(statusColumn, allowedValues);
                },
              };
            },
          };
        },
        select(columns) {
          return {
            eq(column, value) {
              return {
                async maybeSingle() {
                  const builder = raw.from(table) as {
                    select: (c: string) => {
                      eq: (c2: string, v: string) => {
                        maybeSingle: () => SelectResult;
                      };
                    };
                  };
                  const { data, error } = await builder.select(columns).eq(column, value).maybeSingle();
                  return { data: (data as Record<string, unknown> | null) ?? null, error };
                },
              };
            },
          };
        },
      };
    },
    auth: raw.auth,
  };
}

type ClaimRow = { claim_status?: string; attempt_count?: number };

function asClaimRow(data: unknown): ClaimRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? (row as ClaimRow) : null;
}

function logBalancePurchaseWebhookFailure(code: string, detail?: unknown): void {
  console.error(`[balance-purchase-webhook] ${code}`, detail ?? "");
}

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

async function claimBalancePurchaseWebhookEvent(
  admin: BalancePurchaseWebhookAdmin,
  params: {
    stripeEventId: string;
    eventType: string;
    objectId: string | null;
    livemode: boolean;
  },
): Promise<{ status: string }> {
  const { data, error } = await admin.rpc("service_claim_stripe_webhook_event", {
    p_stripe_event_id: params.stripeEventId,
    p_event_type: params.eventType,
    p_object_id: params.objectId,
    p_livemode: params.livemode,
    p_lease_seconds: BALANCE_PURCHASE_WEBHOOK_LEASE_SECONDS,
  });
  if (error) throw error;
  const row = asClaimRow(data);
  if (!row?.claim_status) throw new Error("claim returned no status");
  return { status: row.claim_status };
}

async function completeBalancePurchaseWebhookEvent(
  admin: BalancePurchaseWebhookAdmin,
  stripeEventId: string,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  const { error } = await admin.rpc("service_complete_stripe_webhook_event", {
    p_stripe_event_id: stripeEventId,
    p_success: success,
    p_error: success ? null : (errorMessage ?? "processing_failed").slice(0, 500),
  });
  if (error) throw error;
}

/**
 * Records this PaymentIntent against app_private.stripe_payment_attempts
 * (service_record_stripe_payment_attempt, migration 20260901000021) so the
 * refund path has a real PaymentIntent id to act on. Added during the
 * settlement/refund audit checkpoint: this table has existed since migration
 * 20260901000008 but nothing ever wrote to it before now -- see that
 * migration's comment for the forward-only caveat this implies (a balance
 * purchase that succeeded before this fix shipped has no row here and is not
 * refundable through the new path without a manual backfill).
 *
 * idempotency_key reuses create-balance-purchase.ts's own deterministic
 * `lokala_balance_<clientRequestId>` key (same value, independent unique
 * constraint on this table) -- a replayed payment_intent.succeeded event
 * naturally collides on it, and the RPC's own ON CONFLICT DO NOTHING makes
 * that collision a safe no-op. Best-effort and logged-only, matching this
 * handler's existing discipline for everything past the point money and the
 * gift_claims row are already committed: a failure here must never fail or
 * retry the webhook, and reprocessing could only ever duplicate the attempt
 * row (already prevented by the idempotency key), never fix anything.
 */
async function recordBalancePurchaseStripePaymentAttempt(
  admin: BalancePurchaseWebhookAdmin,
  intent: BalancePurchaseIntentInput,
  livemode: boolean,
): Promise<void> {
  try {
    const orderId = intent.metadata.payment_order_id;
    const clientRequestId = intent.metadata.client_request_id;
    if (!orderId || !clientRequestId) {
      logBalancePurchaseWebhookFailure("payment_attempt_record_skipped_missing_metadata", {
        intentId: intent.id,
        hasOrderId: Boolean(orderId),
        hasClientRequestId: Boolean(clientRequestId),
      });
      return;
    }

    const subtotalCents = Number(intent.metadata.subtotal_cents ?? "0");
    const customerFeeCents = Number(intent.metadata.customer_fee_cents ?? "0");
    const amountCents =
      (Number.isFinite(subtotalCents) ? subtotalCents : 0) +
      (Number.isFinite(customerFeeCents) ? customerFeeCents : 0);

    const { error } = await admin.rpc("service_record_stripe_payment_attempt", {
      p_payment_order_id: orderId,
      p_stripe_payment_intent_id: intent.id,
      p_amount_cents: amountCents,
      p_livemode: livemode,
      p_status: "succeeded",
      p_idempotency_key: `lokala_balance_${clientRequestId}`,
    });
    if (error) throw error;
  } catch (err) {
    logBalancePurchaseWebhookFailure("payment_attempt_record_failed", err);
  }
}

// ---------------------------------------------------------------------------
// Purchaser "gift sent" confirmation lookups.
// ---------------------------------------------------------------------------

async function getBalancePurchasePurchaserId(
  admin: BalancePurchaseWebhookAdmin,
  balancePurchaseId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("balance_purchases")
    .select("purchaser_user_id")
    .eq("id", balancePurchaseId)
    .maybeSingle();
  if (error || !data) return null;
  const value = data.purchaser_user_id;
  return typeof value === "string" ? value : null;
}

async function getGiftClaimExpiryDays(admin: BalancePurchaseWebhookAdmin): Promise<number | null> {
  const { data, error } = await admin.rpc("service_get_gift_claim_expiry_days");
  if (error) return null;
  return typeof data === "number" ? data : null;
}

// ---------------------------------------------------------------------------
// Part 0: status sync for processing/failed/canceled.
//
// payment_orders.status: 'created' | 'awaiting_payment' | 'paid' | 'failed' |
//   'canceled' | 'refunded' | 'disputed' (migration 20260901000004).
// balance_purchases.status: 'awaiting_payment' | 'paid' | 'pending_claim' |
//   'delivered' | 'refunded' | 'disputed' | 'canceled' (same migration) --
//   note there is NO 'failed' value here, unlike payment_orders.
// Both verified directly against the migration before writing this, not
// assumed (the previous checkpoint had to correct 'pending_claim' vs
// 'pending' the same way).
// ---------------------------------------------------------------------------

type StatusSync = { orderStatus: string; purchaseStatus: string | null };

/**
 * processing: no exact match on either enum ('processing' does not exist on
 *   payment_orders). Mapped to 'awaiting_payment' -- the order is still in
 *   flight, which is what 'awaiting_payment' means here. balance_purchases
 *   is left alone (it is already 'awaiting_payment').
 * failed: payment_orders has 'failed'; balance_purchases does not, so it
 *   moves to 'canceled' -- the closest terminal value.
 * canceled: both enums have 'canceled' directly.
 */
function statusSyncFor(targetStatus: BalancePurchaseTargetStatus): StatusSync | null {
  switch (targetStatus) {
    case "processing":
      return { orderStatus: "awaiting_payment", purchaseStatus: null };
    case "failed":
      return { orderStatus: "failed", purchaseStatus: "canceled" };
    case "canceled":
      return { orderStatus: "canceled", purchaseStatus: "canceled" };
    default:
      return null;
  }
}

/** Only advance a row that is still in flight -- an out-of-order or replayed
 * event must never regress a row a later, already-processed event already
 * moved past this point (mirrors advanceTransaction's ADVANCEABLE guard in
 * webhook.ts for the legacy ledger). */
const ORDER_ADVANCEABLE_STATUSES = ["created", "awaiting_payment"];
const PURCHASE_ADVANCEABLE_STATUSES = ["awaiting_payment"];

export async function syncNonSucceededBalancePurchaseStatus(
  admin: BalancePurchaseWebhookAdmin,
  intent: BalancePurchaseIntentInput,
  targetStatus: BalancePurchaseTargetStatus,
): Promise<void> {
  const sync = statusSyncFor(targetStatus);
  if (!sync) return;

  const orderId = intent.metadata.payment_order_id;
  const purchaseId = intent.metadata.balance_purchase_id;

  if (orderId) {
    const { error } = await admin
      .from("payment_orders")
      .update({ status: sync.orderStatus })
      .eq("id", orderId)
      .in("status", ORDER_ADVANCEABLE_STATUSES);
    if (error) throw error;
  }

  if (purchaseId && sync.purchaseStatus) {
    const { error } = await admin
      .from("balance_purchases")
      .update({ status: sync.purchaseStatus })
      .eq("id", purchaseId)
      .in("status", PURCHASE_ADVANCEABLE_STATUSES);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------

export async function handleBalancePurchasePaymentIntentEvent(params: {
  admin: BalancePurchaseWebhookAdmin;
  event: { id: string; type: string; livemode: boolean };
  intent: BalancePurchaseIntentInput;
  targetStatus: BalancePurchaseTargetStatus;
  /** Defaults to the real Resend-backed sender; tests inject a fake. */
  sendGiftClaimEmail?: GiftClaimEmailSender;
  /** Defaults to the real Resend-backed sender; tests inject a fake. */
  sendGiftSentConfirmation?: GiftSentConfirmationSender;
}): Promise<Response> {
  const { admin, event, intent, targetStatus } = params;
  const sendGiftClaimEmail = params.sendGiftClaimEmail ?? sendGiftClaimEmailViaResend;
  const sendGiftSentConfirmation =
    params.sendGiftSentConfirmation ?? sendGiftSentConfirmationEmailViaResend;

  let claim: { status: string };
  try {
    claim = await claimBalancePurchaseWebhookEvent(admin, {
      stripeEventId: event.id,
      eventType: event.type,
      objectId: intent.id,
      livemode: event.livemode,
    });
  } catch (err) {
    logBalancePurchaseWebhookFailure("claim_failed", err);
    return retryLater("could not claim balance purchase event");
  }

  if (claim.status === "already_completed") {
    return ack("duplicate balance purchase event ignored");
  }
  if (claim.status === "in_progress") {
    return retryLater("balance purchase event processing in progress");
  }
  if (claim.status !== "claimed") {
    logBalancePurchaseWebhookFailure("unexpected_claim_status", { status: claim.status });
    return retryLater("could not claim balance purchase event");
  }

  try {
    if (targetStatus !== "succeeded") {
      await syncNonSucceededBalancePurchaseStatus(admin, intent, targetStatus);
      await completeBalancePurchaseWebhookEvent(admin, event.id, true);
      return ack("balance purchase status synced");
    }

    const balancePurchaseId = intent.metadata.balance_purchase_id;
    if (!balancePurchaseId) {
      // Structural mismatch a retry can never fix -- ack so Stripe stops
      // redelivering, but record why for investigation.
      logBalancePurchaseWebhookFailure("missing_balance_purchase_id", {
        intentId: intent.id,
      });
      await completeBalancePurchaseWebhookEvent(admin, event.id, true);
      return ack("missing balance_purchase_id metadata");
    }

    const recipientEmail = intent.metadata.recipient_email ?? null;
    const rpcArgs: Record<string, unknown> = { p_balance_purchase_id: balancePurchaseId };
    let rawToken: string | null = null;

    if (recipientEmail) {
      rawToken = generateRawClaimToken();
      rpcArgs.p_recipient_email_normalized = recipientEmail;
      rpcArgs.p_claim_token_hash = hashClaimToken(rawToken);
    }

    const { error } = await admin.rpc("service_issue_balance_purchase", rpcArgs);
    if (error) {
      throw error;
    }

    // Money and the gift_claims row are now committed. Nothing past this
    // point may throw -- an email failure is logged only.
    await recordBalancePurchaseStripePaymentAttempt(admin, intent, event.livemode);

    if (recipientEmail && rawToken) {
      try {
        const subtotalCents = Number(intent.metadata.subtotal_cents ?? "0");
        await sendGiftClaimEmail({
          to: recipientEmail,
          amountCents: Number.isFinite(subtotalCents) ? subtotalCents : 0,
          currency: "usd",
          claimToken: rawToken,
        });
      } catch (emailErr) {
        logBalancePurchaseWebhookFailure("gift_claim_email_failed", emailErr);
      }

      // Separate try/catch from the recipient's claim email above -- one
      // failing must never suppress or be conflated with the other.
      try {
        const purchaserUserId = await getBalancePurchasePurchaserId(admin, balancePurchaseId);
        const purchaserEmail = purchaserUserId
          ? await getUserEmailById(admin, purchaserUserId)
          : null;
        const expiryDays = await getGiftClaimExpiryDays(admin);

        if (purchaserEmail && expiryDays !== null) {
          const subtotalCents = Number(intent.metadata.subtotal_cents ?? "0");
          await sendGiftSentConfirmation({
            to: purchaserEmail,
            recipientEmail,
            amountCents: Number.isFinite(subtotalCents) ? subtotalCents : 0,
            currency: "usd",
            expiryDays,
          });
        } else {
          logBalancePurchaseWebhookFailure("gift_sent_confirmation_missing_data", {
            hasPurchaserEmail: Boolean(purchaserEmail),
            expiryDays,
          });
        }
      } catch (confirmationErr) {
        logBalancePurchaseWebhookFailure("gift_sent_confirmation_failed", confirmationErr);
      }
    }

    await completeBalancePurchaseWebhookEvent(admin, event.id, true);
    return ack("balance purchase issued");
  } catch (err) {
    logBalancePurchaseWebhookFailure("handler_failed", err);
    try {
      await completeBalancePurchaseWebhookEvent(admin, event.id, false, "processing_failed");
    } catch (completeErr) {
      logBalancePurchaseWebhookFailure("complete_failed", completeErr);
    }
    return retryLater("processing failed");
  }
}
