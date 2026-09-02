import type Stripe from "stripe";

import { getStripe } from "../stripe/server.ts";
import { createAdminClient } from "../supabase/admin.ts";

/**
 * Refund path for a balance purchase (self-top-up, or a gift not yet
 * claimed). SERVER-ONLY. Part 3 of the guardrails checkpoint.
 *
 * Full refund only -- there is no partial-amount parameter. Explicitly out
 * of scope, matching the checkpoint: clawing back an already-claimed or
 * already-spent gift. If the purchase's credit_lot has already been
 * partially or fully consumed, this refuses with "already_spent" rather than
 * attempting a partial reversal.
 *
 * Same read-then-Stripe-then-write ordering as refund.ts (the legacy
 * payment_transactions refund): every check that can be answered from
 * already-committed rows runs BEFORE the Stripe call, so an unrefundable
 * purchase never reaches Stripe at all. The actual reversal (ledger, wallet/
 * credit_lot, gift_claims cancellation, status) happens atomically in
 * app_private.finalize_balance_purchase_refund (migration
 * 20260901000022) AFTER Stripe confirms the refund -- and re-validates
 * everything itself under a fresh row lock, so a race in the gap between the
 * pre-check and the Stripe call can never corrupt the ledger. If finalize
 * throws after Stripe has already refunded the charge, that is logged
 * loudly and surfaced as a db_error: the money already left Stripe, so this
 * never retries the Stripe call, only reports that reconciliation is needed.
 *
 * Requires app_private.stripe_payment_attempts to have a row for this
 * purchase's payment_order_id (service_get_stripe_payment_attempt_for_order,
 * migration 20260901000021). That table is only populated going forward
 * from when balance-purchase-webhook.ts started writing to it -- a purchase
 * that succeeded before that fix shipped has no row and cannot be refunded
 * through this path (reported as "no_payment_intent") without a manual
 * backfill.
 */

export type RefundBalancePurchaseFailure =
  | "invalid_request"
  | "not_found"
  | "not_refundable"
  | "already_spent"
  | "no_payment_intent"
  | "stripe_unavailable"
  | "db_error";

export type RefundBalancePurchaseResult =
  | {
      ok: true;
      httpStatus: 200;
      refund: {
        balancePurchaseId: string;
        orderId: string;
        refundedCents: number;
        currency: string;
        idempotent: boolean;
      };
    }
  | { ok: false; httpStatus: number; failure: { category: RefundBalancePurchaseFailure; detail?: unknown } };

export type RefundBalancePurchaseInput = {
  /** payment_orders.id -- matches GET /api/balance-purchases/[orderId]. */
  orderId: string;
  /** Verified user id of the caller; must be the purchase's own purchaser. */
  actorId: string;
  reason?: string | null;
};

export type BalancePurchaseRefundRow = {
  id: string;
  paymentOrderId: string;
  purchaserUserId: string;
  recipientUserId: string | null;
  status: "awaiting_payment" | "paid" | "pending_claim" | "delivered" | "refunded" | "disputed" | "canceled";
  faceValueCents: number;
  customerFeeCents: number;
  totalPaidCents: number;
  currency: string;
};

export type CreditLotRefundRow = {
  status: string;
  remainingAmountCents: number;
  originalAmountCents: number;
};

/** The dependencies refundBalancePurchase needs. Production calls go through
 * defaultDeps() (createAdminClient() / getStripe()); tests inject a fake. */
export type RefundBalancePurchaseDeps = {
  getBalancePurchaseForOrder(orderId: string): Promise<BalancePurchaseRefundRow | null>;
  getCreditLot(balancePurchaseId: string): Promise<CreditLotRefundRow | null>;
  getStripePaymentIntentId(paymentOrderId: string): Promise<string | null>;
  createStripeRefund(args: {
    stripePaymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
    reason?: string | null;
  }): Promise<{ stripeRefundId: string }>;
  finalizeRefund(args: {
    balancePurchaseId: string;
    stripeRefundId: string;
    amountCents: number;
    reason?: string | null;
  }): Promise<{ refundId: string; idempotent: boolean }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  httpStatus: number,
  category: RefundBalancePurchaseFailure,
  detail?: unknown,
): RefundBalancePurchaseResult {
  return { ok: false, httpStatus, failure: { category, detail } };
}

type BalancePurchaseSelectRow = {
  id: string;
  payment_order_id: string;
  purchaser_user_id: string;
  recipient_user_id: string | null;
  status: BalancePurchaseRefundRow["status"];
  face_value_cents: number;
  customer_fee_cents: number;
  total_paid_cents: number;
  currency: string;
};

type CreditLotSelectRow = {
  status: string;
  remaining_amount_cents: number;
  original_amount_cents: number;
};

function defaultDeps(): RefundBalancePurchaseDeps {
  const admin = createAdminClient();
  const stripe = getStripe();

  return {
    async getBalancePurchaseForOrder(orderId) {
      const { data } = await admin
        .from("balance_purchases")
        .select(
          "id, payment_order_id, purchaser_user_id, recipient_user_id, status, " +
            "face_value_cents, customer_fee_cents, total_paid_cents, currency",
        )
        .eq("payment_order_id", orderId)
        .maybeSingle<BalancePurchaseSelectRow>();

      if (!data) return null;
      return {
        id: data.id,
        paymentOrderId: data.payment_order_id,
        purchaserUserId: data.purchaser_user_id,
        recipientUserId: data.recipient_user_id,
        status: data.status,
        faceValueCents: data.face_value_cents,
        customerFeeCents: data.customer_fee_cents,
        totalPaidCents: data.total_paid_cents,
        currency: data.currency,
      };
    },

    async getCreditLot(balancePurchaseId) {
      const { data } = await admin
        .from("credit_lots")
        .select("status, remaining_amount_cents, original_amount_cents")
        .eq("balance_purchase_id", balancePurchaseId)
        .maybeSingle<CreditLotSelectRow>();

      if (!data) return null;
      return {
        status: data.status,
        remainingAmountCents: data.remaining_amount_cents,
        originalAmountCents: data.original_amount_cents,
      };
    },

    async getStripePaymentIntentId(paymentOrderId) {
      const { data, error } = await admin.rpc("service_get_stripe_payment_attempt_for_order", {
        p_payment_order_id: paymentOrderId,
      });
      if (error || !data) return null;
      const value = (data as Record<string, unknown>).stripe_payment_intent_id;
      return typeof value === "string" ? value : null;
    },

    async createStripeRefund({ stripePaymentIntentId, amountCents, idempotencyKey, reason }) {
      const refund: Stripe.Refund = await stripe.refunds.create(
        {
          payment_intent: stripePaymentIntentId,
          amount: amountCents,
          ...(reason ? { metadata: { reason } } : {}),
        },
        { idempotencyKey },
      );
      return { stripeRefundId: refund.id };
    },

    async finalizeRefund({ balancePurchaseId, stripeRefundId, amountCents, reason }) {
      const { data, error } = await admin.rpc("service_finalize_balance_purchase_refund", {
        p_balance_purchase_id: balancePurchaseId,
        p_stripe_refund_id: stripeRefundId,
        p_amount_cents: amountCents,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      const row = data as Record<string, unknown>;
      return { refundId: String(row.refund_id), idempotent: Boolean(row.idempotent) };
    },
  };
}

export async function refundBalancePurchase(
  input: RefundBalancePurchaseInput,
  deps?: RefundBalancePurchaseDeps,
): Promise<RefundBalancePurchaseResult> {
  const { orderId, actorId } = input;

  if (!UUID_RE.test(orderId) || !actorId) {
    return fail(400, "invalid_request");
  }

  const d = deps ?? defaultDeps();

  const purchase = await d.getBalancePurchaseForOrder(orderId);
  // Unknown order and unauthorized both answer the same way: never confirm
  // a purchase belonging to someone else exists.
  if (!purchase || purchase.purchaserUserId !== actorId) {
    return fail(404, "not_found");
  }

  // Idempotent replay: report the already-recorded refund, refund nothing
  // a second time. Amount is always the full total_paid_cents -- this path
  // never does partial refunds, so there is nothing else to look up.
  if (purchase.status === "refunded") {
    return {
      ok: true,
      httpStatus: 200,
      refund: {
        balancePurchaseId: purchase.id,
        orderId: purchase.paymentOrderId,
        refundedCents: purchase.totalPaidCents,
        currency: purchase.currency,
        idempotent: true,
      },
    };
  }

  if (purchase.status !== "delivered" && purchase.status !== "pending_claim") {
    return fail(409, "not_refundable", { status: purchase.status });
  }

  if (purchase.status === "delivered") {
    const lot = await d.getCreditLot(purchase.id);
    if (!lot) {
      return fail(500, "db_error", { reason: "missing credit_lot for a delivered balance_purchase" });
    }
    if (lot.status !== "available" || lot.remainingAmountCents !== lot.originalAmountCents) {
      return fail(409, "already_spent");
    }
  }

  const stripePaymentIntentId = await d.getStripePaymentIntentId(purchase.paymentOrderId);
  if (!stripePaymentIntentId) {
    return fail(409, "no_payment_intent");
  }

  let stripeRefundId: string;
  try {
    const refund = await d.createStripeRefund({
      stripePaymentIntentId,
      amountCents: purchase.totalPaidCents,
      idempotencyKey: `lokala_balance_refund_${purchase.id}`,
      reason: input.reason ?? null,
    });
    stripeRefundId = refund.stripeRefundId;
  } catch (err) {
    return fail(502, "stripe_unavailable", err);
  }

  try {
    await d.finalizeRefund({
      balancePurchaseId: purchase.id,
      stripeRefundId,
      amountCents: purchase.totalPaidCents,
      reason: input.reason ?? null,
    });
  } catch (err) {
    // The refund DID happen at Stripe. Surface loudly: the ledger/wallet is
    // now behind and reconciliation must repair it. Never retry the Stripe
    // call blindly -- stripeRefundId is already final.
    console.error("[refund-balance-purchase] finalize_failed_after_stripe_refund", {
      balancePurchaseId: purchase.id,
      stripeRefundId,
      err,
    });
    return fail(500, "db_error", { reason: "stripe refund succeeded but internal reversal failed", stripeRefundId });
  }

  return {
    ok: true,
    httpStatus: 200,
    refund: {
      balancePurchaseId: purchase.id,
      orderId: purchase.paymentOrderId,
      refundedCents: purchase.totalPaidCents,
      currency: purchase.currency,
      idempotent: false,
    },
  };
}
