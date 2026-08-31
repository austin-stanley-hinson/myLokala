/**
 * createBalancePurchase: self-top-up + gift purchase creation.
 * Run with `npm test`.
 *
 * Validation-failure tests run with Supabase/Stripe env vars deliberately
 * cleared (see beforeEach/afterEach) and no `deps` injected. createAdminClient()
 * and getStripe() both throw synchronously the moment they are called without
 * their env vars set, so a test that resolves cleanly -- rather than
 * rejecting with a "not set" error -- is itself proof the code path under
 * test never reached the database or Stripe.
 *
 * DB-dependent tests (cap enforcement against a live wallet, idempotent
 * replay, mismatched replay) inject a fake BalancePurchaseAdmin / stripe
 * (deps), so they stay fast, deterministic, and fully offline.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import {
  MAX_BALANCE_PURCHASE_CENTS,
  MAX_WALLET_BALANCE_CENTS,
  createBalancePurchase,
  type BalancePurchaseAdmin,
  type InsertResult,
  type NewOrderRow,
  type NewPurchaseRow,
  type OrderRow,
  type PaymentIntentStripe,
  type PurchaseRow,
  type WalletRow,
} from "./create-balance-purchase.ts";
import { calculateCustomerFeeCents } from "./fees.ts";

/** Real colin_v1 fee for a subtotal, so fixtures never hand-guess a number
 * that must independently match what createBalancePurchase itself computes. */
function feeFor(subtotalCents: number): { customer_fee_cents: number; total_cents: number } {
  const customer_fee_cents = calculateCustomerFeeCents(subtotalCents, "card");
  return { customer_fee_cents, total_cents: subtotalCents + customer_fee_cents };
}

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------
// Fake admin: an in-memory implementation of BalancePurchaseAdmin, so
// DB-dependent tests exercise the real replay/mismatch/cap logic without a
// live database.
// ---------------------------------------------------------------------------

function makeFakeAdmin(seed: {
  wallets?: Record<string, WalletRow>;
  orders?: OrderRow[];
  purchases?: PurchaseRow[];
} = {}): BalancePurchaseAdmin & { orders: OrderRow[]; purchases: PurchaseRow[] } {
  const wallets = seed.wallets ?? {};
  const orders: OrderRow[] = seed.orders ?? [];
  const purchases: PurchaseRow[] = seed.purchases ?? [];

  return {
    orders,
    purchases,
    async getActiveWallet(userId) {
      const wallet = wallets[userId];
      if (!wallet || wallet.status !== "active") return null;
      return wallet;
    },
    async insertOrder(row: NewOrderRow): Promise<InsertResult<OrderRow>> {
      const existing = orders.find(
        (o) => o.user_id === row.user_id && o.client_request_id === row.client_request_id,
      );
      if (existing) {
        return { row: existing, duplicate: true, error: null };
      }
      const inserted: OrderRow = {
        id: randomUUID(),
        user_id: row.user_id,
        subtotal_cents: row.subtotal_cents,
        customer_fee_cents: row.customer_fee_cents,
        total_cents: row.total_cents,
        currency: row.currency,
        pricing_version: row.pricing_version,
        client_request_id: row.client_request_id,
        status: row.status,
      };
      orders.push(inserted);
      return { row: inserted, duplicate: false, error: null };
    },
    async insertPurchase(row: NewPurchaseRow): Promise<InsertResult<PurchaseRow>> {
      const existing = purchases.find((p) => p.payment_order_id === row.payment_order_id);
      if (existing) {
        return { row: existing, duplicate: true, error: null };
      }
      const inserted: PurchaseRow = {
        id: randomUUID(),
        payment_order_id: row.payment_order_id,
        purchase_kind: row.purchase_kind,
        recipient_user_id: row.recipient_user_id,
        status: row.status,
      };
      purchases.push(inserted);
      return { row: inserted, duplicate: false, error: null };
    },
  };
}

function makeFakeStripe(): PaymentIntentStripe & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    paymentIntents: {
      async create(params, options) {
        calls.push({ params, options });
        return {
          id: `pi_fake_${calls.length}`,
          client_secret: `pi_fake_${calls.length}_secret`,
          livemode: false,
        };
      },
    },
  };
}

describe("createBalancePurchase: validation never reaches Stripe or the database", () => {
  it("rejects an unexpected field (e.g. a stray gift-shaped field) before anything else", async () => {
    const result = await createBalancePurchase({
      body: { clientRequestId: randomUUID(), subtotalCents: 1000, giftMessage: "hi" },
      customerId: randomUUID(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 400);
    assert.equal(result.failure.category, "unexpected_fields");
  });

  it("rejects when unauthenticated", async () => {
    const result = await createBalancePurchase({
      body: { clientRequestId: randomUUID(), subtotalCents: 1000 },
      customerId: null,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 401);
    assert.equal(result.failure.category, "unauthenticated");
  });

  it("rejects a malformed clientRequestId", async () => {
    const result = await createBalancePurchase({
      body: { clientRequestId: "not-a-uuid", subtotalCents: 1000 },
      customerId: randomUUID(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "invalid_client_request_id");
  });

  it("rejects a non-positive subtotal", async () => {
    const result = await createBalancePurchase({
      body: { clientRequestId: randomUUID(), subtotalCents: 0 },
      customerId: randomUUID(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "invalid_amount");
  });

  it("rejects a purchase over the cap without ever reading a wallet", async () => {
    const result = await createBalancePurchase({
      body: {
        clientRequestId: randomUUID(),
        subtotalCents: MAX_BALANCE_PURCHASE_CENTS + 1,
      },
      customerId: randomUUID(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 400);
    assert.equal(result.failure.category, "purchase_limit_exceeded");
  });

  it("rejects a malformed recipientEmail", async () => {
    const result = await createBalancePurchase({
      body: {
        clientRequestId: randomUUID(),
        subtotalCents: 1000,
        recipientEmail: "not-an-email",
      },
      customerId: randomUUID(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "invalid_recipient");
  });

  it("treats an explicit null recipientEmail as self-top-up, not an error", async () => {
    // Still fails validation-before-DB (the cap), but MUST fail as a purchase
    // cap violation, not as invalid_recipient -- proving null is accepted as
    // "no recipient" per the module contract.
    const result = await createBalancePurchase({
      body: {
        clientRequestId: randomUUID(),
        subtotalCents: MAX_BALANCE_PURCHASE_CENTS + 1,
        recipientEmail: null,
      },
      customerId: randomUUID(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "purchase_limit_exceeded");
  });
});

describe("createBalancePurchase: cap enforcement", () => {
  it("rejects wallet_limit_exceeded for a self-top-up that would push the wallet over the cap", async () => {
    const customerId = randomUUID();
    const admin = makeFakeAdmin({
      wallets: {
        [customerId]: { balance_cents: MAX_WALLET_BALANCE_CENTS - 500, status: "active" },
      },
    });

    const result = await createBalancePurchase(
      { body: { clientRequestId: randomUUID(), subtotalCents: 1000 }, customerId },
      { admin },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 400);
    assert.equal(result.failure.category, "wallet_limit_exceeded");
    assert.equal(admin.orders.length, 0, "no order should be inserted on a cap violation");
  });

  it("does not enforce the wallet cap for a gift (no wallet lookup at all)", async () => {
    const customerId = randomUUID();
    // No wallets seeded -- if the gift path tried to read one, it would get
    // null and fail as wallet_unavailable instead of succeeding.
    const admin = makeFakeAdmin();
    const stripe = makeFakeStripe();

    const result = await createBalancePurchase(
      {
        body: {
          clientRequestId: randomUUID(),
          subtotalCents: MAX_WALLET_BALANCE_CENTS,
          recipientEmail: "friend@example.com",
        },
        customerId,
      },
      { admin, stripe },
    );

    assert.equal(result.ok, true);
  });

  it("allows a self-top-up right at the wallet cap boundary", async () => {
    const customerId = randomUUID();
    const admin = makeFakeAdmin({
      wallets: { [customerId]: { balance_cents: MAX_WALLET_BALANCE_CENTS - 1000, status: "active" } },
    });
    const stripe = makeFakeStripe();

    const result = await createBalancePurchase(
      { body: { clientRequestId: randomUUID(), subtotalCents: 1000 }, customerId },
      { admin, stripe },
    );

    assert.equal(result.ok, true);
  });

  it("rejects wallet_unavailable when the purchaser has no active wallet", async () => {
    const customerId = randomUUID();
    const admin = makeFakeAdmin({
      wallets: { [customerId]: { balance_cents: 0, status: "frozen" } },
    });

    const result = await createBalancePurchase(
      { body: { clientRequestId: randomUUID(), subtotalCents: 1000 }, customerId },
      { admin },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "wallet_unavailable");
  });
});

describe("createBalancePurchase: self vs gift branching", () => {
  it("creates a self_top_up purchase with recipient_user_id set to the purchaser", async () => {
    const customerId = randomUUID();
    const admin = makeFakeAdmin({ wallets: { [customerId]: { balance_cents: 0, status: "active" } } });
    const stripe = makeFakeStripe();

    const result = await createBalancePurchase(
      { body: { clientRequestId: randomUUID(), subtotalCents: 1000 }, customerId },
      { admin, stripe },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.session.purchaseKind, "self_top_up");
    assert.equal(admin.purchases[0]?.recipient_user_id, customerId);
    const call = stripe.calls[0] as { params: { metadata: Record<string, string> } };
    assert.equal(call.params.metadata.purchase_kind, "self_top_up");
    assert.equal("recipient_email" in call.params.metadata, false);
  });

  it("creates a gift purchase with recipient_user_id null and the email in Stripe metadata", async () => {
    const customerId = randomUUID();
    const admin = makeFakeAdmin();
    const stripe = makeFakeStripe();

    const result = await createBalancePurchase(
      {
        body: {
          clientRequestId: randomUUID(),
          subtotalCents: 1000,
          recipientEmail: "  Friend@Example.COM  ",
        },
        customerId,
      },
      { admin, stripe },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.session.purchaseKind, "gift");
    assert.equal(admin.purchases[0]?.recipient_user_id, null);
    const call = stripe.calls[0] as { params: { metadata: Record<string, string> } };
    assert.equal(call.params.metadata.purchase_kind, "gift");
    // Normalized: trimmed and lowercased before it ever reaches Stripe.
    assert.equal(call.params.metadata.recipient_email, "friend@example.com");
  });

  it("never sends transfer_data or application_fee_amount -- this is a platform charge", async () => {
    const customerId = randomUUID();
    const admin = makeFakeAdmin({ wallets: { [customerId]: { balance_cents: 0, status: "active" } } });
    const stripe = makeFakeStripe();

    await createBalancePurchase(
      { body: { clientRequestId: randomUUID(), subtotalCents: 1000 }, customerId },
      { admin, stripe },
    );

    const call = stripe.calls[0] as { params: Record<string, unknown> };
    assert.equal("transfer_data" in call.params, false);
    assert.equal("application_fee_amount" in call.params, false);
  });

  it("restricts payment methods to card only, explicitly -- never automatic_payment_methods", async () => {
    const customerId = randomUUID();
    const admin = makeFakeAdmin({ wallets: { [customerId]: { balance_cents: 0, status: "active" } } });
    const stripe = makeFakeStripe();

    await createBalancePurchase(
      { body: { clientRequestId: randomUUID(), subtotalCents: 1000 }, customerId },
      { admin, stripe },
    );

    const call = stripe.calls[0] as { params: Record<string, unknown> };
    assert.deepEqual(call.params.payment_method_types, ["card"]);
    assert.equal("automatic_payment_methods" in call.params, false);
  });

  it("uses the deterministic lokala_balance_ idempotency key derived from clientRequestId", async () => {
    const customerId = randomUUID();
    const clientRequestId = randomUUID();
    const admin = makeFakeAdmin({ wallets: { [customerId]: { balance_cents: 0, status: "active" } } });
    const stripe = makeFakeStripe();

    await createBalancePurchase(
      { body: { clientRequestId, subtotalCents: 1000 }, customerId },
      { admin, stripe },
    );

    const call = stripe.calls[0] as { options: { idempotencyKey: string } };
    assert.equal(call.options.idempotencyKey, `lokala_balance_${clientRequestId}`);
  });
});

describe("createBalancePurchase: idempotent replay", () => {
  it("replaying the same clientRequestId does not insert a second order or purchase", async () => {
    const customerId = randomUUID();
    const clientRequestId = randomUUID();
    const admin = makeFakeAdmin({ wallets: { [customerId]: { balance_cents: 0, status: "active" } } });
    const stripe = makeFakeStripe();
    const body = { clientRequestId, subtotalCents: 1000 };

    const first = await createBalancePurchase({ body, customerId }, { admin, stripe });
    const second = await createBalancePurchase({ body, customerId }, { admin, stripe });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.httpStatus, 201);
    assert.equal(second.httpStatus, 200);
    assert.equal(first.session.orderId, second.session.orderId);
    assert.equal(first.session.purchaseId, second.session.purchaseId);
    assert.equal(admin.orders.length, 1);
    assert.equal(admin.purchases.length, 1);
  });
});

describe("createBalancePurchase: mismatched-replay rejection", () => {
  it("rejects a replay that changes the amount for the same clientRequestId", async () => {
    const customerId = randomUUID();
    const clientRequestId = randomUUID();
    const admin = makeFakeAdmin({
      wallets: { [customerId]: { balance_cents: 0, status: "active" } },
      // Pre-seed an order as if an earlier, different-amount request won the race.
      orders: [
        {
          id: randomUUID(),
          user_id: customerId,
          subtotal_cents: 500,
          customer_fee_cents: 500 /* irrelevant exact value */,
          total_cents: 1000,
          currency: "USD",
          pricing_version: "colin_v1",
          client_request_id: clientRequestId,
          status: "created",
        },
      ],
    });

    const result = await createBalancePurchase(
      { body: { clientRequestId, subtotalCents: 2000 }, customerId },
      { admin },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 409);
    assert.equal(result.failure.category, "request_mismatch");
  });

  it("rejects a replay that switches self-top-up to a gift for the same clientRequestId", async () => {
    const customerId = randomUUID();
    const clientRequestId = randomUUID();
    const orderId = randomUUID();
    const admin = makeFakeAdmin({
      orders: [
        {
          id: orderId,
          user_id: customerId,
          subtotal_cents: 1000,
          ...feeFor(1000),
          currency: "USD",
          pricing_version: "colin_v1",
          client_request_id: clientRequestId,
          status: "created",
        },
      ],
      purchases: [
        {
          id: randomUUID(),
          payment_order_id: orderId,
          purchase_kind: "self_top_up",
          recipient_user_id: customerId,
          status: "awaiting_payment",
        },
      ],
    });

    const result = await createBalancePurchase(
      {
        body: { clientRequestId, subtotalCents: 1000, recipientEmail: "friend@example.com" },
        customerId,
      },
      { admin },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "request_mismatch");
  });

  it("rejects a replay against an already-succeeded order (already_succeeded)", async () => {
    const customerId = randomUUID();
    const clientRequestId = randomUUID();
    const admin = makeFakeAdmin({
      wallets: { [customerId]: { balance_cents: 0, status: "active" } },
      orders: [
        {
          id: randomUUID(),
          user_id: customerId,
          subtotal_cents: 1000,
          ...feeFor(1000),
          currency: "USD",
          pricing_version: "colin_v1",
          client_request_id: clientRequestId,
          status: "paid",
        },
      ],
    });

    const result = await createBalancePurchase(
      { body: { clientRequestId, subtotalCents: 1000 }, customerId },
      { admin },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 409);
    assert.equal(result.failure.category, "already_succeeded");
  });

  it("rejects a replay against a closed order (attempt_closed)", async () => {
    const customerId = randomUUID();
    const clientRequestId = randomUUID();
    const admin = makeFakeAdmin({
      wallets: { [customerId]: { balance_cents: 0, status: "active" } },
      orders: [
        {
          id: randomUUID(),
          user_id: customerId,
          subtotal_cents: 1000,
          ...feeFor(1000),
          currency: "USD",
          pricing_version: "colin_v1",
          client_request_id: clientRequestId,
          status: "canceled",
        },
      ],
    });

    const result = await createBalancePurchase(
      { body: { clientRequestId, subtotalCents: 1000 }, customerId },
      { admin },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "attempt_closed");
  });
});
