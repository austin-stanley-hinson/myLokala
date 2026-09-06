import type Stripe from "stripe";

import { getStripe } from "../stripe/server.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { calculateCustomerFeeCents } from "./fees.ts";

/**
 * Durable gift-balance purchase creation (self-top-up and gift-by-email).
 * SERVER-ONLY.
 *
 * Same ordering discipline as createPayment (create-payment.ts), applied to
 * `payment_orders` / `balance_purchases` instead of `payment_transactions`:
 *
 *   1. validate the request shape;
 *   2. compute the fee on the server from subtotalCents alone;
 *   3. enforce platform caps before creating anything with Stripe;
 *   4. write payment_orders (status: created), then balance_purchases
 *      (status: awaiting_payment, purchase_kind reflecting self vs gift),
 *      BEFORE Stripe, so a charge can never exist that Lokala has no
 *      record of;
 *   5. create exactly one PaymentIntent, keyed off client_request_id.
 *
 * Idempotency has two independent layers, matching createPayment:
 * `payment_orders.(user_id, client_request_id)` is UNIQUE, so N concurrent
 * requests collapse to one row. The Stripe idempotency key is derived from
 * that same id, so a retry can never double-charge even if the row update
 * loses a race.
 *
 * Gift-to-unknown-recipient only: `recipientEmail` present means a gift, but
 * there is no "gift to an existing Lokala user" lookup here -- every gift
 * goes through the gift_claims/claim-token path regardless of whether the
 * email happens to already have an account, matching how the recipient is
 * only ever resolved at claim time. Nothing is emailed by this module; a
 * gift's PaymentIntent metadata carries the normalized recipientEmail so the
 * webhook (Part 3) can pass it to service_issue_balance_purchase once the
 * charge succeeds.
 *
 * Platform caps (platform_config.max_balance_purchase_cents /
 * max_wallet_balance_cents, migration 20260901000004, seeded 50000/50000)
 * are mirrored here as constants rather than read live: app_private is not
 * in the Data API and no service_* wrapper exposes platform_config yet, the
 * same reason FEE_POLICY_VERSION in fees.ts mirrors
 * platform_config.pricing_version instead of reading it. This is not the
 * only enforcement either way: app_private.issue_balance_purchase re-checks
 * the purchase cap (both kinds) and the wallet cap (self-top-up only) against
 * the live row at issuance time regardless, so a drifted constant here could
 * reject a purchase too early but can never let one over-issue. The wallet
 * cap is checked here only for self-top-up: a gift's face value never lands
 * in the purchaser's own wallet (it credits unclaimed_gift_liability instead,
 * uncapped, exactly like issue_balance_purchase's gift branch), and the
 * eventual claimant's wallet cap is enforced at claim time, not here.
 *
 * The database and Stripe layers are injected (BalancePurchaseAdmin /
 * PaymentIntentStripe) rather than calling createAdminClient() / getStripe()
 * inline, unlike createPayment. That is a deliberate deviation: it is what
 * makes idempotent-replay, mismatched-replay, and cap enforcement genuinely
 * unit-testable here (see create-balance-purchase.test.ts) without a live
 * database, which createPayment's hard-wired client does not allow for. The
 * real code path (createBalancePurchase() called with no `deps`) behaves
 * identically to createPayment's -- both are constructed lazily, only once
 * validation has passed.
 */

export type CreateBalancePurchaseFailure =
  | "unexpected_fields"
  | "unauthenticated"
  | "invalid_client_request_id"
  | "invalid_amount"
  | "invalid_recipient"
  | "purchase_limit_exceeded"
  | "wallet_unavailable"
  | "wallet_limit_exceeded"
  | "already_succeeded"
  | "attempt_closed"
  | "request_mismatch"
  | "stripe_unavailable"
  | "db_error"
  | "server_error";

/** Server-side diagnostic detail. Never returned to a client. */
export type CreateBalancePurchaseDiagnostic = {
  category: CreateBalancePurchaseFailure;
  detail?: unknown;
};

/**
 * Mirrors app_private.platform_config.max_balance_purchase_cents. See the
 * module docstring for why this is a constant rather than a live read.
 */
export const MAX_BALANCE_PURCHASE_CENTS = 50_000;

/** Mirrors app_private.platform_config.max_wallet_balance_cents. */
export const MAX_WALLET_BALANCE_CENTS = 50_000;

/**
 * Raw, untrusted request body. Only these three keys are ever read; any
 * other key present is rejected before any other validation runs.
 */
export type RawBalancePurchaseBody = Record<string, unknown>;

const ALLOWED_BODY_KEYS = new Set(["clientRequestId", "subtotalCents", "recipientEmail"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateBalancePurchaseInput = {
  body: RawBalancePurchaseBody;
  /** Verified user id from the session. Never taken from the body -- both
   * self-top-up and gift purchases require an authenticated purchaser. */
  customerId: string | null;
};

export type OrderStatus =
  | "created"
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "refunded"
  | "disputed";

export type PurchaseKind = "self_top_up" | "gift";

export type BalancePurchaseSession = {
  purchaseId: string;
  orderId: string;
  purchaseKind: PurchaseKind;
  status: OrderStatus;
  subtotalCents: number;
  customerFeeCents: number;
  totalCents: number;
  currency: string;
  pricingVersion: string;
  /** Omitted once the order is terminal -- a settled order is not retryable. */
  clientSecret: string | null;
};

export type CreateBalancePurchaseResult =
  | { ok: true; httpStatus: 200 | 201; session: BalancePurchaseSession }
  | { ok: false; httpStatus: number; failure: CreateBalancePurchaseDiagnostic };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  httpStatus: number,
  category: CreateBalancePurchaseFailure,
  detail?: unknown,
): CreateBalancePurchaseResult {
  return { ok: false, httpStatus, failure: { category, detail } };
}

/** Deterministic Stripe idempotency key: one attempt can only ever make one intent. */
function balancePurchaseIdempotencyKey(clientRequestId: string): string {
  return `lokala_balance_${clientRequestId}`;
}

// ---------------------------------------------------------------------------
// Database layer (injectable -- see the module docstring).
// ---------------------------------------------------------------------------

export type OrderRow = {
  id: string;
  user_id: string;
  subtotal_cents: number;
  customer_fee_cents: number;
  total_cents: number;
  currency: string;
  pricing_version: string;
  client_request_id: string;
  status: OrderStatus;
};

export type PurchaseRow = {
  id: string;
  payment_order_id: string;
  purchase_kind: PurchaseKind;
  recipient_user_id: string | null;
  status:
    | "awaiting_payment"
    | "paid"
    | "pending_claim"
    | "delivered"
    | "refunded"
    | "disputed"
    | "canceled";
};

export type WalletRow = { balance_cents: number; status: string };

export type NewOrderRow = {
  user_id: string;
  kind: "balance_purchase";
  subtotal_cents: number;
  customer_fee_cents: number;
  total_cents: number;
  currency: "USD";
  pricing_version: string;
  client_request_id: string;
  status: "created";
};

export type NewPurchaseRow = {
  purchaser_user_id: string;
  purchase_kind: PurchaseKind;
  recipient_user_id: string | null;
  face_value_cents: number;
  customer_fee_cents: number;
  total_paid_cents: number;
  currency: "USD";
  pricing_version: string;
  payment_order_id: string;
  status: "awaiting_payment";
};

export type InsertResult<T> = {
  row: T | null;
  /** True when an existing row was returned because of a unique-constraint
   * collision (a replay), rather than a freshly inserted one. */
  duplicate: boolean;
  error: unknown;
};

/** The database surface createBalancePurchase needs. Production calls go
 * through defaultAdmin() (createAdminClient()); tests inject a fake. */
export type BalancePurchaseAdmin = {
  getActiveWallet(userId: string): Promise<WalletRow | null>;
  insertOrder(row: NewOrderRow): Promise<InsertResult<OrderRow>>;
  insertPurchase(row: NewPurchaseRow): Promise<InsertResult<PurchaseRow>>;
};

const ORDER_COLUMNS =
  "id, user_id, subtotal_cents, customer_fee_cents, total_cents, currency, " +
  "pricing_version, client_request_id, status";
const PURCHASE_COLUMNS =
  "id, payment_order_id, purchase_kind, recipient_user_id, status";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}

function defaultAdmin(): BalancePurchaseAdmin {
  const admin = createAdminClient();

  return {
    async getActiveWallet(userId) {
      const { data } = await admin
        .from("wallets")
        .select("balance_cents, status")
        .eq("user_id", userId)
        .eq("currency", "USD")
        .maybeSingle<WalletRow>();

      if (!data || data.status !== "active") return null;
      return data;
    },

    async insertOrder(row) {
      const { data, error } = await admin
        .from("payment_orders")
        .insert(row)
        .select(ORDER_COLUMNS)
        .maybeSingle<OrderRow>();

      if (!error) return { row: data ?? null, duplicate: false, error: null };
      if (!isUniqueViolation(error)) return { row: null, duplicate: false, error };

      // 23505 on (user_id, client_request_id): this is a replay.
      const { data: existing, error: selectError } = await admin
        .from("payment_orders")
        .select(ORDER_COLUMNS)
        .eq("user_id", row.user_id)
        .eq("client_request_id", row.client_request_id)
        .maybeSingle<OrderRow>();

      if (selectError || !existing) {
        return { row: null, duplicate: true, error: selectError ?? error };
      }
      return { row: existing, duplicate: true, error: null };
    },

    async insertPurchase(row) {
      const { data, error } = await admin
        .from("balance_purchases")
        .insert(row)
        .select(PURCHASE_COLUMNS)
        .maybeSingle<PurchaseRow>();

      if (!error) return { row: data ?? null, duplicate: false, error: null };
      if (!isUniqueViolation(error)) return { row: null, duplicate: false, error };

      // 23505 on payment_order_id: this is a replay of the same order.
      const { data: existing, error: selectError } = await admin
        .from("balance_purchases")
        .select(PURCHASE_COLUMNS)
        .eq("payment_order_id", row.payment_order_id)
        .maybeSingle<PurchaseRow>();

      if (selectError || !existing) {
        return { row: null, duplicate: true, error: selectError ?? error };
      }
      return { row: existing, duplicate: true, error: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Stripe layer (also injectable, for the same reason).
// ---------------------------------------------------------------------------

export type PaymentIntentStripe = {
  paymentIntents: {
    create: (
      params: Stripe.PaymentIntentCreateParams,
      options: { idempotencyKey: string },
    ) => Promise<{ id: string; client_secret: string | null; livemode: boolean }>;
  };
};

// ---------------------------------------------------------------------------

/** True when a replayed order does not describe the same purchase. */
function isMismatchedOrder(
  order: OrderRow,
  input: {
    customerId: string;
    subtotalCents: number;
    customerFeeCents: number;
    totalCents: number;
  },
): boolean {
  if (order.user_id !== input.customerId) return true;
  if (order.subtotal_cents !== input.subtotalCents) return true;
  if (order.customer_fee_cents !== input.customerFeeCents) return true;
  if (order.total_cents !== input.totalCents) return true;
  return false;
}

/** True when a replayed purchase does not describe the same self/gift intent. */
function isMismatchedPurchase(
  purchase: PurchaseRow,
  input: { purchaseKind: PurchaseKind; recipientUserId: string | null },
): boolean {
  if (purchase.purchase_kind !== input.purchaseKind) return true;
  if (purchase.recipient_user_id !== input.recipientUserId) return true;
  return false;
}

function toSession(
  order: OrderRow,
  purchase: PurchaseRow,
  clientSecret: string | null,
): BalancePurchaseSession {
  return {
    purchaseId: purchase.id,
    orderId: order.id,
    purchaseKind: purchase.purchase_kind,
    status: order.status,
    subtotalCents: order.subtotal_cents,
    customerFeeCents: order.customer_fee_cents,
    totalCents: order.total_cents,
    currency: order.currency,
    pricingVersion: order.pricing_version,
    clientSecret,
  };
}

export type CreateBalancePurchaseDeps = {
  admin?: BalancePurchaseAdmin;
  stripe?: PaymentIntentStripe;
};

export async function createBalancePurchase(
  input: CreateBalancePurchaseInput,
  deps?: CreateBalancePurchaseDeps,
): Promise<CreateBalancePurchaseResult> {
  const { body, customerId } = input;

  const unexpectedKeys = Object.keys(body).filter((key) => !ALLOWED_BODY_KEYS.has(key));
  if (unexpectedKeys.length > 0) {
    return fail(400, "unexpected_fields", { unexpectedKeys });
  }

  if (typeof customerId !== "string" || customerId.length === 0) {
    return fail(401, "unauthenticated");
  }

  const clientRequestId = body.clientRequestId;
  if (typeof clientRequestId !== "string" || !UUID_RE.test(clientRequestId)) {
    return fail(400, "invalid_client_request_id");
  }

  const rawSubtotal = body.subtotalCents;
  if (
    typeof rawSubtotal !== "number" ||
    !Number.isInteger(rawSubtotal) ||
    rawSubtotal <= 0
  ) {
    return fail(400, "invalid_amount", { subtotalCents: rawSubtotal });
  }

  // Purchase cap applies uniformly to both self-top-up and gift, before
  // anything else touches the database or Stripe.
  if (rawSubtotal > MAX_BALANCE_PURCHASE_CENTS) {
    return fail(400, "purchase_limit_exceeded", {
      subtotalCents: rawSubtotal,
      maxBalancePurchaseCents: MAX_BALANCE_PURCHASE_CENTS,
    });
  }

  // Fees are always computed here, never accepted from the caller. Card is
  // the only method offered at balance-purchase checkout today.
  let customerFeeCents: number;
  try {
    customerFeeCents = calculateCustomerFeeCents(rawSubtotal, "card");
  } catch (err) {
    return fail(400, "invalid_amount", err);
  }
  const totalCents = rawSubtotal + customerFeeCents;

  // recipientEmail omitted or null -> self-top-up. Present -> gift; must be a
  // well-formed email, normalized (trim + lowercase) before use anywhere.
  const rawRecipientEmail = body.recipientEmail;
  let recipientEmail: string | null = null;
  if (rawRecipientEmail !== undefined && rawRecipientEmail !== null) {
    if (
      typeof rawRecipientEmail !== "string" ||
      !EMAIL_RE.test(rawRecipientEmail.trim())
    ) {
      return fail(400, "invalid_recipient", { recipientEmail: rawRecipientEmail });
    }
    recipientEmail = rawRecipientEmail.trim().toLowerCase();
  }
  const isGift = recipientEmail !== null;
  const purchaseKind: PurchaseKind = isGift ? "gift" : "self_top_up";
  const recipientUserId = isGift ? null : customerId;

  const admin = deps?.admin ?? defaultAdmin();

  // Wallet cap: only meaningful for self-top-up. A gift's face value never
  // lands in the purchaser's own wallet at issuance (it credits
  // unclaimed_gift_liability instead), so there is no wallet to cap here --
  // issue_balance_purchase's gift branch does not check one either.
  if (!isGift) {
    const wallet = await admin.getActiveWallet(customerId);
    if (!wallet) {
      return fail(409, "wallet_unavailable", { customerId });
    }
    if (wallet.balance_cents + rawSubtotal > MAX_WALLET_BALANCE_CENTS) {
      return fail(400, "wallet_limit_exceeded", {
        currentBalanceCents: wallet.balance_cents,
        subtotalCents: rawSubtotal,
        maxWalletBalanceCents: MAX_WALLET_BALANCE_CENTS,
      });
    }
  }

  // Claim the attempt. UNIQUE(user_id, client_request_id) means concurrent
  // duplicates collapse to a single row; the losers read the winner here.
  const {
    row: order,
    duplicate: orderIsReplay,
    error: insertOrderError,
  } = await admin.insertOrder({
    user_id: customerId,
    kind: "balance_purchase",
    subtotal_cents: rawSubtotal,
    customer_fee_cents: customerFeeCents,
    total_cents: totalCents,
    currency: "USD",
    pricing_version: "colin_v1",
    client_request_id: clientRequestId,
    status: "created",
  });

  if (!order) {
    return fail(500, "db_error", insertOrderError);
  }

  // A replay must describe the same purchase, or we refuse rather than risk
  // charging the first amount (or the other kind) for a second request.
  if (
    isMismatchedOrder(order, {
      customerId,
      subtotalCents: rawSubtotal,
      customerFeeCents,
      totalCents,
    })
  ) {
    return fail(409, "request_mismatch", { orderId: order.id });
  }

  // Terminal states are never retryable and never hand back a client secret.
  if (order.status === "paid") {
    return fail(409, "already_succeeded", { orderId: order.id });
  }
  if (
    order.status === "failed" ||
    order.status === "canceled" ||
    order.status === "refunded" ||
    order.status === "disputed"
  ) {
    return fail(409, "attempt_closed", { orderId: order.id, status: order.status });
  }

  const {
    row: purchase,
    error: insertPurchaseError,
  } = await admin.insertPurchase({
    purchaser_user_id: customerId,
    purchase_kind: purchaseKind,
    recipient_user_id: recipientUserId,
    face_value_cents: rawSubtotal,
    customer_fee_cents: customerFeeCents,
    total_paid_cents: totalCents,
    currency: "USD",
    pricing_version: "colin_v1",
    payment_order_id: order.id,
    status: "awaiting_payment",
  });

  if (!purchase) {
    return fail(500, "db_error", insertPurchaseError);
  }

  if (isMismatchedPurchase(purchase, { purchaseKind, recipientUserId })) {
    return fail(409, "request_mismatch", { orderId: order.id, purchaseId: purchase.id });
  }

  const stripe = deps?.stripe ?? getStripe();

  // Platform charge: no transfer_data, no application_fee_amount. This
  // charges the customer buying (or gifting) balance, not a merchant -- there
  // is no connected-account destination here.
  //
  // Card only, explicit. automatic_payment_methods would otherwise surface
  // whatever the connected Stripe account's Dashboard has enabled (bank
  // debit, Klarna, etc.) -- ACH is priced in fees.ts but deliberately not yet
  // offered at checkout, and nothing here should let Stripe decide that.
  let intent: { id: string; client_secret: string | null; livemode: boolean };
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        payment_method_types: ["card"],
        metadata: {
          payment_order_id: order.id,
          balance_purchase_id: purchase.id,
          client_request_id: clientRequestId,
          kind: "balance_purchase",
          purchase_kind: purchaseKind,
          pricing_version: order.pricing_version,
          subtotal_cents: String(rawSubtotal),
          customer_fee_cents: String(customerFeeCents),
          ...(isGift ? { recipient_email: recipientEmail as string } : {}),
        },
      },
      { idempotencyKey: balancePurchaseIdempotencyKey(clientRequestId) },
    );
  } catch (err) {
    // The pending order/purchase rows stay; a retry with the same id resumes
    // here, and reconciliation cancels it if the customer never comes back.
    return fail(502, "stripe_unavailable", err);
  }

  return {
    ok: true,
    httpStatus: orderIsReplay ? 200 : 201,
    session: toSession(order, purchase, intent.client_secret),
  };
}
