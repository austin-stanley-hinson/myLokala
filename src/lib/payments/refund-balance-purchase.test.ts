/**
 * refundBalancePurchase: refund path for a balance purchase (self-top-up or
 * a not-yet-claimed gift). Run with `npm test`.
 *
 * Every test injects a fake RefundBalancePurchaseDeps, so this stays fully
 * offline -- no live database, no real Stripe call. The ordering this proves
 * (all DB-only checks before Stripe, Stripe before the internal finalize,
 * finalize failure surfaced loudly rather than retried) mirrors refund.ts's
 * discipline for the legacy payment_transactions refund.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import {
  refundBalancePurchase,
  type BalancePurchaseRefundRow,
  type CreditLotRefundRow,
  type RefundBalancePurchaseDeps,
} from "./refund-balance-purchase.ts";

function purchase(over: Partial<BalancePurchaseRefundRow> = {}): BalancePurchaseRefundRow {
  return {
    id: randomUUID(),
    paymentOrderId: randomUUID(),
    purchaserUserId: "user-purchaser",
    recipientUserId: "user-purchaser",
    status: "delivered",
    faceValueCents: 2000,
    customerFeeCents: 60,
    totalPaidCents: 2060,
    currency: "USD",
    ...over,
  };
}

function neverCallStripe() {
  return async (): Promise<{ stripeRefundId: string }> => {
    throw new Error("createStripeRefund should not be called for this test");
  };
}

function neverFinalize() {
  return async (): Promise<{ refundId: string; idempotent: boolean }> => {
    throw new Error("finalizeRefund should not be called for this test");
  };
}

function makeDeps(overrides: {
  purchase?: BalancePurchaseRefundRow | null;
  creditLot?: CreditLotRefundRow | null;
  stripePaymentIntentId?: string | null;
  stripeOutcome?: { stripeRefundId: string } | Error;
  finalizeOutcome?: { refundId: string; idempotent: boolean } | Error;
} = {}): RefundBalancePurchaseDeps & {
  finalizeCalls: Array<Record<string, unknown>>;
  stripeCalls: Array<Record<string, unknown>>;
} {
  const finalizeCalls: Array<Record<string, unknown>> = [];
  const stripeCalls: Array<Record<string, unknown>> = [];

  return {
    finalizeCalls,
    stripeCalls,
    async getBalancePurchaseForOrder() {
      return overrides.purchase === undefined ? purchase() : overrides.purchase;
    },
    async getCreditLot() {
      return overrides.creditLot === undefined
        ? { status: "available", remainingAmountCents: 2000, originalAmountCents: 2000 }
        : overrides.creditLot;
    },
    async getStripePaymentIntentId() {
      return overrides.stripePaymentIntentId === undefined ? "pi_refund_test" : overrides.stripePaymentIntentId;
    },
    async createStripeRefund(args) {
      stripeCalls.push(args);
      const outcome = overrides.stripeOutcome ?? { stripeRefundId: "re_test" };
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    async finalizeRefund(args) {
      finalizeCalls.push(args);
      const outcome = overrides.finalizeOutcome ?? { refundId: randomUUID(), idempotent: false };
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

describe("refundBalancePurchase: authorization and existence", () => {
  it("returns not_found for an unknown order (never confirms existence)", async () => {
    const deps = makeDeps({ purchase: null });
    deps.createStripeRefund = neverCallStripe();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-a" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "not_found");
    assert.equal(result.httpStatus, 404);
  });

  it("returns not_found (not not_permitted) when the caller is not the purchaser", async () => {
    const deps = makeDeps({ purchase: purchase({ purchaserUserId: "user-owner" }) });
    deps.createStripeRefund = neverCallStripe();

    const result = await refundBalancePurchase(
      { orderId: randomUUID(), actorId: "user-someone-else" },
      deps,
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "not_found");
  });

  it("rejects a malformed orderId before touching any dependency", async () => {
    const deps = makeDeps();
    deps.getBalancePurchaseForOrder = async () => {
      throw new Error("should not be called for an invalid orderId");
    };

    const result = await refundBalancePurchase({ orderId: "not-a-uuid", actorId: "user-a" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "invalid_request");
  });
});

describe("refundBalancePurchase: status gating", () => {
  it("refuses a purchase that is still awaiting_payment", async () => {
    const deps = makeDeps({ purchase: purchase({ status: "awaiting_payment" }) });
    deps.createStripeRefund = neverCallStripe();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "not_refundable");
  });

  it("refuses a canceled purchase", async () => {
    const deps = makeDeps({ purchase: purchase({ status: "canceled" }) });
    deps.createStripeRefund = neverCallStripe();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "not_refundable");
  });

  it("a delivered self-top-up with an unspent credit_lot is refunded", async () => {
    const deps = makeDeps({ purchase: purchase({ status: "delivered" }) });

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.refund.refundedCents, 2060);
    assert.equal(result.refund.idempotent, false);
  });

  it("a pending_claim (unclaimed) gift is refunded without ever reading a credit_lot", async () => {
    const deps = makeDeps({ purchase: purchase({ status: "pending_claim" }) });
    deps.getCreditLot = async () => {
      throw new Error("getCreditLot should not be called for an unclaimed gift -- none exists yet");
    };

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, true);
  });
});

describe("refundBalancePurchase: already-spent balance is refused, not partially reversed", () => {
  it("refuses when the credit_lot has been partially consumed", async () => {
    const deps = makeDeps({
      purchase: purchase({ status: "delivered" }),
      creditLot: { status: "available", remainingAmountCents: 500, originalAmountCents: 2000 },
    });
    deps.createStripeRefund = neverCallStripe();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "already_spent");
  });

  it("refuses when the credit_lot is already exhausted", async () => {
    const deps = makeDeps({
      purchase: purchase({ status: "delivered" }),
      creditLot: { status: "exhausted", remainingAmountCents: 0, originalAmountCents: 2000 },
    });
    deps.createStripeRefund = neverCallStripe();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "already_spent");
  });
});

describe("refundBalancePurchase: idempotent replay", () => {
  it("a purchase already marked refunded is reported idempotently, Stripe is never called again", async () => {
    const deps = makeDeps({ purchase: purchase({ status: "refunded" }) });
    deps.createStripeRefund = neverCallStripe();
    deps.finalizeRefund = neverFinalize();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.refund.idempotent, true);
    assert.equal(result.refund.refundedCents, 2060);
  });
});

describe("refundBalancePurchase: missing PaymentIntent (forward-only gap)", () => {
  it("refuses with no_payment_intent when no stripe_payment_attempts row exists, before ever calling Stripe", async () => {
    const deps = makeDeps({ purchase: purchase({ status: "delivered" }), stripePaymentIntentId: null });
    deps.createStripeRefund = neverCallStripe();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "no_payment_intent");
  });
});

describe("refundBalancePurchase: Stripe call shape", () => {
  it("refunds the full total_paid_cents with a deterministic idempotency key derived from the purchase id", async () => {
    const fixedPurchase = purchase({ status: "delivered", totalPaidCents: 4321 });
    const deps = makeDeps({ purchase: fixedPurchase });

    await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(deps.stripeCalls.length, 1);
    assert.equal(deps.stripeCalls[0]!.amountCents, 4321);
    assert.equal(deps.stripeCalls[0]!.idempotencyKey, `lokala_balance_refund_${fixedPurchase.id}`);
  });

  it("a Stripe failure is reported as stripe_unavailable and finalize is never called", async () => {
    const deps = makeDeps({
      purchase: purchase({ status: "delivered" }),
      stripeOutcome: new Error("Your card was declined."),
    });
    deps.finalizeRefund = neverFinalize();

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "stripe_unavailable");
  });
});

describe("refundBalancePurchase: finalize failure after a successful Stripe refund", () => {
  it("is surfaced as db_error, never silently reported as success", async () => {
    const deps = makeDeps({
      purchase: purchase({ status: "delivered" }),
      finalizeOutcome: new Error("simulated finalize failure"),
    });

    const result = await refundBalancePurchase({ orderId: randomUUID(), actorId: "user-purchaser" }, deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "db_error");
    // Stripe was still called exactly once -- the failure is purely on the
    // internal-reversal side, not a reason to have skipped or retried Stripe.
    assert.equal(deps.stripeCalls.length, 1);
  });
});
