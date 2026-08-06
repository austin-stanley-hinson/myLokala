import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side refunds for the payment ledger. SERVER-ONLY.
 *
 * Full and partial refunds are the same operation with a different amount. For
 * a merchant QR payment (a destination charge) the refund must also unwind the
 * Connect side, so we reverse the transfer and refund the application fee
 * proportionally -- otherwise Lokala would keep its fee on money the customer
 * got back, and the merchant would absorb the whole reversal.
 *
 * Gift purchases are platform charges with no connected account, so neither
 * reversal applies. They are also not merchant-refundable: crediting has
 * already happened through the ledger, so unwinding one is an operator action
 * rather than something a business can trigger.
 *
 * Idempotency: the caller supplies a `refundRequestId`, which both derives the
 * deterministic Stripe idempotency key and is recorded on the row. Replaying the
 * same request returns the recorded result instead of refunding again, and the
 * running total is capped at the amount actually charged.
 */

export type RefundFailure =
  | "invalid_request"
  | "not_found"
  | "not_refundable"
  | "amount_exceeds_charge"
  | "not_permitted"
  | "stripe_unavailable"
  | "db_error";

export type RefundResult =
  | {
      ok: true;
      httpStatus: 200;
      refund: {
        paymentId: string;
        refundStatus: string;
        refundedCents: number;
        totalCents: number;
        currency: string;
      };
    }
  | { ok: false; httpStatus: number; failure: { category: RefundFailure; detail?: unknown } };

export type RefundInput = {
  paymentId: string;
  /** Omit for a full refund of the remaining balance. */
  amountCents?: number | null;
  refundRequestId: string;
  reason?: string | null;
  /** Verified user id of the caller. */
  actorId: string;
};

type RefundRow = {
  id: string;
  kind: string;
  status: string;
  business_owner_id: string | null;
  charged_cents: number;
  currency: string;
  application_fee_cents: number;
  refund_status: string;
  refunded_cents: number;
  application_fee_refunded_cents: number;
  last_refund_request_id: string | null;
  stripe_payment_intent_id: string | null;
};

const REFUND_COLUMNS =
  "id, kind, status, business_owner_id, charged_cents, currency, " +
  "application_fee_cents, refund_status, refunded_cents, " +
  "application_fee_refunded_cents, last_refund_request_id, stripe_payment_intent_id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  httpStatus: number,
  category: RefundFailure,
  detail?: unknown,
): RefundResult {
  return { ok: false, httpStatus, failure: { category, detail } };
}

export async function refundPayment(input: RefundInput): Promise<RefundResult> {
  const { paymentId, refundRequestId, actorId } = input;

  if (!UUID_RE.test(paymentId) || !UUID_RE.test(refundRequestId)) {
    return fail(400, "invalid_request");
  }

  const admin = createAdminClient();

  const { data: row, error: selectError } = await admin
    .from("payment_transactions")
    .select(REFUND_COLUMNS)
    .eq("id", paymentId)
    .maybeSingle<RefundRow>();

  if (selectError) {
    return fail(500, "db_error", selectError);
  }
  // Unknown id and unauthorized both answer the same way: never confirm
  // existence to someone who cannot act on the payment.
  if (!row) {
    return fail(404, "not_found");
  }

  // Only the merchant who received the payment may refund it. Gift purchases
  // have no merchant and are operator-only.
  if (row.kind !== "merchant_qr_payment" || row.business_owner_id !== actorId) {
    return fail(404, "not_found", { reason: "not permitted", paymentId });
  }

  if (row.status !== "succeeded") {
    return fail(409, "not_refundable", { status: row.status });
  }
  if (!row.stripe_payment_intent_id) {
    return fail(409, "not_refundable", { reason: "no payment intent" });
  }

  // Replay of the same refund request: report the recorded state, refund nothing.
  if (row.last_refund_request_id === refundRequestId) {
    return {
      ok: true,
      httpStatus: 200,
      refund: {
        paymentId: row.id,
        refundStatus: row.refund_status,
        refundedCents: row.refunded_cents,
        totalCents: row.charged_cents,
        currency: row.currency,
      },
    };
  }

  const remainingCents = row.charged_cents - row.refunded_cents;
  if (remainingCents <= 0) {
    return fail(409, "not_refundable", { reason: "already fully refunded" });
  }

  const requested =
    input.amountCents === undefined || input.amountCents === null
      ? remainingCents
      : input.amountCents;

  if (!Number.isInteger(requested) || requested <= 0) {
    return fail(400, "invalid_request", { requested });
  }
  if (requested > remainingCents) {
    return fail(409, "amount_exceeds_charge", { requested, remainingCents });
  }

  let refund: Stripe.Refund;
  try {
    refund = await getStripe().refunds.create(
      {
        payment_intent: row.stripe_payment_intent_id,
        amount: requested,
        // Destination charge: pull the funds back from the connected account and
        // give back Lokala's proportional share of the application fee.
        reverse_transfer: true,
        refund_application_fee: true,
        ...(input.reason ? { metadata: { reason: input.reason } } : {}),
      },
      { idempotencyKey: `lokala_refund_${refundRequestId}` },
    );
  } catch (err) {
    return fail(502, "stripe_unavailable", err);
  }

  const refundedCents = row.refunded_cents + requested;
  const isFull = refundedCents >= row.charged_cents;

  // Application fee is refunded proportionally by Stripe; mirror that ratio on
  // the ledger so merchant net and Lokala revenue stay reconcilable.
  const applicationFeeRefundedCents = Math.min(
    row.application_fee_cents,
    Math.round((row.application_fee_cents * refundedCents) / row.charged_cents),
  );

  const { error: updateError } = await admin
    .from("payment_transactions")
    .update({
      refunded_cents: refundedCents,
      refund_status: isFull ? "full" : "partial",
      application_fee_refunded_cents: applicationFeeRefundedCents,
      refunded_at: new Date().toISOString(),
      stripe_refund_id: refund.id,
      last_refund_request_id: refundRequestId,
      refund_reason: input.reason ?? null,
    })
    .eq("id", row.id);

  if (updateError) {
    // The refund DID happen at Stripe. Surface loudly: the ledger is now behind
    // and reconciliation must repair it. Never retry the Stripe call blindly.
    console.error("[refund] ledger_update_failed_after_stripe_refund", {
      paymentId: row.id,
      refundId: refund.id,
      updateError,
    });
    return fail(500, "db_error", updateError);
  }

  return {
    ok: true,
    httpStatus: 200,
    refund: {
      paymentId: row.id,
      refundStatus: isFull ? "full" : "partial",
      refundedCents,
      totalCents: row.charged_cents,
      currency: row.currency,
    },
  };
}
