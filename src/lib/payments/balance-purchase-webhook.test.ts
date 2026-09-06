/**
 * handleBalancePurchasePaymentIntentEvent. Run with `npm test`.
 *
 * A fake BalancePurchaseWebhookAdmin simulates the app_private webhook claim
 * table (service_claim_stripe_webhook_event / service_complete_stripe_webhook_event)
 * plus payment_orders/balance_purchases as in-memory tables, so both the
 * "exactly once, even on retry" guarantee and Part 0's status-sync are proven
 * against real branching logic, not asserted by inspection. Every test that
 * reaches the gift-issuance path injects a fake email sender -- never the
 * real Resend-backed one -- so `npm test` never makes a live network call or
 * sends a real email.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import {
  handleBalancePurchasePaymentIntentEvent,
  syncNonSucceededBalancePurchaseStatus,
  toBalancePurchaseWebhookAdmin,
  type BalancePurchaseWebhookAdmin,
} from "./balance-purchase-webhook.ts";
import type { SendGiftClaimEmailInput } from "./gift-claim-email.ts";
import type { SendGiftSentConfirmationInput } from "./gift-purchaser-email.ts";

type RpcCall = { fn: string; args?: Record<string, unknown> };
type TableRow = Record<string, unknown>;

function makeFakeAdmin(
  opts: {
    issueError?: { message: string };
    tables?: { payment_orders?: TableRow[]; balance_purchases?: TableRow[] };
    userEmails?: Record<string, string>;
    expiryDays?: number;
    expiryDaysError?: { message: string };
    recordPaymentAttemptError?: { message: string };
  } = {},
): BalancePurchaseWebhookAdmin & {
  calls: RpcCall[];
  tables: Record<string, TableRow[]>;
} {
  const calls: RpcCall[] = [];
  const completedEvents = new Set<string>();
  const tables: Record<string, TableRow[]> = {
    payment_orders: opts.tables?.payment_orders ?? [],
    balance_purchases: opts.tables?.balance_purchases ?? [],
  };
  const userEmails = opts.userEmails ?? {};

  return {
    calls,
    tables,
    async rpc(fn, args) {
      calls.push({ fn, args });

      if (fn === "service_claim_stripe_webhook_event") {
        const eventId = args?.p_stripe_event_id as string;
        if (completedEvents.has(eventId)) {
          return { data: [{ claim_status: "already_completed", attempt_count: 1 }], error: null };
        }
        return { data: [{ claim_status: "claimed", attempt_count: 1 }], error: null };
      }

      if (fn === "service_complete_stripe_webhook_event") {
        const eventId = args?.p_stripe_event_id as string;
        if (args?.p_success) completedEvents.add(eventId);
        return { data: null, error: null };
      }

      if (fn === "service_issue_balance_purchase") {
        if (opts.issueError) return { data: null, error: opts.issueError };
        return { data: { status: "delivered", idempotent: false }, error: null };
      }

      if (fn === "service_get_gift_claim_expiry_days") {
        if (opts.expiryDaysError) return { data: null, error: opts.expiryDaysError };
        return { data: opts.expiryDays ?? 30, error: null };
      }

      if (fn === "service_record_stripe_payment_attempt") {
        if (opts.recordPaymentAttemptError) {
          return { data: null, error: opts.recordPaymentAttemptError };
        }
        return { data: { inserted: true }, error: null };
      }

      return { data: null, error: null };
    },
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              return {
                async in(statusColumn: string, allowedValues: string[]) {
                  const rows = tables[table] ?? [];
                  const row = rows.find((r) => r[column] === value);
                  if (!row) return { error: null };
                  if (!allowedValues.includes(row[statusColumn] as string)) {
                    // Guard: row is not in an advanceable state -- no-op, not an error.
                    return { error: null };
                  }
                  Object.assign(row, patch);
                  return { error: null };
                },
              };
            },
          };
        },
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  const rows = tables[table] ?? [];
                  const row = rows.find((r) => r[column] === value);
                  return { data: row ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        async getUserById(userId: string) {
          const email = userEmails[userId];
          if (!email) return { data: { user: null }, error: null };
          return { data: { user: { email } }, error: null };
        },
      },
    },
  };
}

function issueCalls(admin: { calls: RpcCall[] }): RpcCall[] {
  return admin.calls.filter((c) => c.fn === "service_issue_balance_purchase");
}

function recordPaymentAttemptCalls(admin: { calls: RpcCall[] }): RpcCall[] {
  return admin.calls.filter((c) => c.fn === "service_record_stripe_payment_attempt");
}

function neverSendEmail(): Promise<void> {
  throw new Error("sendGiftClaimEmail should not be called for this test");
}

function neverSendGiftSentConfirmation(): Promise<void> {
  throw new Error("sendGiftSentConfirmation should not be called for this test");
}

function fakeEmailSender(): {
  send: (input: SendGiftClaimEmailInput) => Promise<void>;
  calls: SendGiftClaimEmailInput[];
} {
  const calls: SendGiftClaimEmailInput[] = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
    },
  };
}

function fakeGiftSentConfirmationSender(): {
  send: (input: SendGiftSentConfirmationInput) => Promise<void>;
  calls: SendGiftSentConfirmationInput[];
} {
  const calls: SendGiftSentConfirmationInput[] = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
    },
  };
}

describe("handleBalancePurchasePaymentIntentEvent: exactly-once on retry", () => {
  it("a webhook retry of the same event does not call service_issue_balance_purchase twice", async () => {
    const admin = makeFakeAdmin();
    const balancePurchaseId = randomUUID();
    const event = { id: "evt_retry_1", type: "payment_intent.succeeded", livemode: false };
    const intent = {
      id: "pi_retry_1",
      metadata: {
        kind: "balance_purchase",
        balance_purchase_id: balancePurchaseId,
        payment_order_id: randomUUID(),
        client_request_id: "req-retry-1",
      },
    };

    const first = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event,
      intent,
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });
    const second = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event,
      intent,
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(issueCalls(admin).length, 1);
    // The webhook-level replay guard (claim_status: already_completed) short-
    // circuits before any RPC of the second delivery runs at all -- so the
    // attempt-recording call is naturally called at most once too.
    assert.equal(recordPaymentAttemptCalls(admin).length, 1);
  });
});

describe("handleBalancePurchasePaymentIntentEvent: stripe_payment_attempts recording", () => {
  it("self top-up: records the PaymentIntent id, order id, and status once, before any gift-only work", async () => {
    const admin = makeFakeAdmin();
    const orderId = randomUUID();
    const balancePurchaseId = randomUUID();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_record_self", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_record_self",
        metadata: {
          kind: "balance_purchase",
          payment_order_id: orderId,
          balance_purchase_id: balancePurchaseId,
          client_request_id: "req-record-self",
          subtotal_cents: "2000",
          customer_fee_cents: "60",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    const calls = recordPaymentAttemptCalls(admin);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.args?.p_payment_order_id, orderId);
    assert.equal(calls[0]!.args?.p_stripe_payment_intent_id, "pi_record_self");
    assert.equal(calls[0]!.args?.p_amount_cents, 2060);
    assert.equal(calls[0]!.args?.p_livemode, false);
    assert.equal(calls[0]!.args?.p_status, "succeeded");
    assert.equal(calls[0]!.args?.p_idempotency_key, "lokala_balance_req-record-self");
  });

  it("gift: also records the attempt (not skipped just because a recipient email is present)", async () => {
    const admin = makeFakeAdmin();
    const orderId = randomUUID();
    const balancePurchaseId = randomUUID();

    await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_record_gift", type: "payment_intent.succeeded", livemode: true },
      intent: {
        id: "pi_record_gift",
        metadata: {
          kind: "balance_purchase",
          payment_order_id: orderId,
          balance_purchase_id: balancePurchaseId,
          client_request_id: "req-record-gift",
          recipient_email: "friend@example.com",
          subtotal_cents: "1000",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: async () => {},
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    const calls = recordPaymentAttemptCalls(admin);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.args?.p_stripe_payment_intent_id, "pi_record_gift");
    assert.equal(calls[0]!.args?.p_livemode, true);
  });

  it("a failure recording the payment attempt never blocks the webhook or issuance", async () => {
    const admin = makeFakeAdmin({ recordPaymentAttemptError: { message: "simulated insert failure" } });
    const balancePurchaseId = randomUUID();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_record_fail", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_record_fail",
        metadata: {
          kind: "balance_purchase",
          payment_order_id: randomUUID(),
          balance_purchase_id: balancePurchaseId,
          client_request_id: "req-record-fail",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    assert.equal(issueCalls(admin).length, 1);
    const completeCalls = admin.calls.filter((c) => c.fn === "service_complete_stripe_webhook_event");
    assert.equal(completeCalls.at(-1)?.args?.p_success, true);
  });

  it("skips recording (and does not throw) when payment_order_id or client_request_id metadata is missing", async () => {
    const admin = makeFakeAdmin();
    const balancePurchaseId = randomUUID();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_record_missing_meta", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_record_missing_meta",
        metadata: { kind: "balance_purchase", balance_purchase_id: balancePurchaseId },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    assert.equal(recordPaymentAttemptCalls(admin).length, 0);
  });
});

describe("handleBalancePurchasePaymentIntentEvent: self vs gift", () => {
  it("self top-up: issues with only p_balance_purchase_id and never sends an email", async () => {
    const admin = makeFakeAdmin();
    const balancePurchaseId = randomUUID();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_self", type: "payment_intent.succeeded", livemode: false },
      intent: { id: "pi_self", metadata: { kind: "balance_purchase", balance_purchase_id: balancePurchaseId } },
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    const [call] = issueCalls(admin);
    assert.equal(call.args?.p_balance_purchase_id, balancePurchaseId);
    assert.equal("p_recipient_email_normalized" in (call.args ?? {}), false);
    assert.equal("p_claim_token_hash" in (call.args ?? {}), false);
  });

  it("gift: issues with a normalized recipient email and a claim token hash, and emails the raw token (never the hash)", async () => {
    const admin = makeFakeAdmin();
    const balancePurchaseId = randomUUID();
    const emailer = fakeEmailSender();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_gift", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_gift",
        metadata: {
          kind: "balance_purchase",
          balance_purchase_id: balancePurchaseId,
          recipient_email: "friend@example.com",
          subtotal_cents: "2000",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: emailer.send,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    const [call] = issueCalls(admin);
    assert.equal(call.args?.p_recipient_email_normalized, "friend@example.com");
    const hash = call.args?.p_claim_token_hash as string;
    assert.match(hash, /^[0-9a-f]{64}$/);

    assert.equal(emailer.calls.length, 1);
    const emailInput = emailer.calls[0]!;
    assert.equal(emailInput.to, "friend@example.com");
    assert.equal(emailInput.amountCents, 2000);
    // The RPC gets the hash; the email gets the raw token. They must differ,
    // and the raw token must never equal what was hashed and sent to Postgres.
    assert.notEqual(emailInput.claimToken, hash);
    assert.equal(emailInput.claimToken.length > 0, true);
  });
});

describe("handleBalancePurchasePaymentIntentEvent: gift-claim email failure never blocks the webhook", () => {
  it("still completes the claim and acks 200 when the email sender throws", async () => {
    const admin = makeFakeAdmin();
    const balancePurchaseId = randomUUID();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_email_fail", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_email_fail",
        metadata: {
          kind: "balance_purchase",
          balance_purchase_id: balancePurchaseId,
          recipient_email: "friend@example.com",
          subtotal_cents: "1000",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: async () => {
        throw new Error("Resend API error 500: simulated outage");
      },
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    // Issuance still happened (money already moved) and the event is still
    // marked completed -- a retry would only resend the email, not help.
    assert.equal(issueCalls(admin).length, 1);
    const completeCalls = admin.calls.filter((c) => c.fn === "service_complete_stripe_webhook_event");
    assert.equal(completeCalls.at(-1)?.args?.p_success, true);
  });
});

describe("handleBalancePurchasePaymentIntentEvent: Part 0 status sync", () => {
  it("payment_intent.payment_failed: payment_orders -> failed, balance_purchases -> canceled", async () => {
    const orderId = randomUUID();
    const purchaseId = randomUUID();
    const admin = makeFakeAdmin({
      tables: {
        payment_orders: [{ id: orderId, status: "awaiting_payment" }],
        balance_purchases: [{ id: purchaseId, status: "awaiting_payment" }],
      },
    });

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_failed", type: "payment_intent.payment_failed", livemode: false },
      intent: {
        id: "pi_failed",
        metadata: { kind: "balance_purchase", payment_order_id: orderId, balance_purchase_id: purchaseId },
      },
      targetStatus: "failed",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    assert.equal(issueCalls(admin).length, 0);
    assert.equal(admin.tables.payment_orders![0]!.status, "failed");
    assert.equal(admin.tables.balance_purchases![0]!.status, "canceled");
  });

  it("payment_intent.canceled: both tables move to canceled", async () => {
    const orderId = randomUUID();
    const purchaseId = randomUUID();
    const admin = makeFakeAdmin({
      tables: {
        payment_orders: [{ id: orderId, status: "created" }],
        balance_purchases: [{ id: purchaseId, status: "awaiting_payment" }],
      },
    });

    await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_canceled", type: "payment_intent.canceled", livemode: false },
      intent: {
        id: "pi_canceled",
        metadata: { kind: "balance_purchase", payment_order_id: orderId, balance_purchase_id: purchaseId },
      },
      targetStatus: "canceled",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(admin.tables.payment_orders![0]!.status, "canceled");
    assert.equal(admin.tables.balance_purchases![0]!.status, "canceled");
  });

  it("payment_intent.processing: payment_orders -> awaiting_payment, balance_purchases untouched", async () => {
    const orderId = randomUUID();
    const purchaseId = randomUUID();
    const admin = makeFakeAdmin({
      tables: {
        payment_orders: [{ id: orderId, status: "created" }],
        balance_purchases: [{ id: purchaseId, status: "awaiting_payment" }],
      },
    });

    await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_processing", type: "payment_intent.processing", livemode: false },
      intent: {
        id: "pi_processing",
        metadata: { kind: "balance_purchase", payment_order_id: orderId, balance_purchase_id: purchaseId },
      },
      targetStatus: "processing",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(admin.tables.payment_orders![0]!.status, "awaiting_payment");
    assert.equal(admin.tables.balance_purchases![0]!.status, "awaiting_payment");
  });

  it("does not regress an already-terminal order on a late/out-of-order failed event", async () => {
    const orderId = randomUUID();
    const admin = makeFakeAdmin({
      tables: { payment_orders: [{ id: orderId, status: "paid" }] },
    });

    await syncNonSucceededBalancePurchaseStatus(
      admin,
      { id: "pi_late", metadata: { payment_order_id: orderId } },
      "failed",
    );

    // 'paid' is not in the advanceable set, so the guard must leave it alone.
    assert.equal(admin.tables.payment_orders![0]!.status, "paid");
  });
});

describe("handleBalancePurchasePaymentIntentEvent: malformed metadata", () => {
  it("acks (does not retry forever) when balance_purchase_id metadata is missing", async () => {
    const admin = makeFakeAdmin();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_missing_meta", type: "payment_intent.succeeded", livemode: false },
      intent: { id: "pi_missing_meta", metadata: { kind: "balance_purchase" } },
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
    assert.equal(issueCalls(admin).length, 0);
  });
});

describe("handleBalancePurchasePaymentIntentEvent: issuance failure", () => {
  it("asks Stripe to retry when service_issue_balance_purchase errors", async () => {
    const admin = makeFakeAdmin({ issueError: { message: "wallet is not active" } });

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_issue_error", type: "payment_intent.succeeded", livemode: false },
      intent: { id: "pi_issue_error", metadata: { kind: "balance_purchase", balance_purchase_id: randomUUID() } },
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 500);

    const completeCalls = admin.calls.filter((c) => c.fn === "service_complete_stripe_webhook_event");
    assert.equal(completeCalls.at(-1)?.args?.p_success, false);
  });
});

describe("handleBalancePurchasePaymentIntentEvent: purchaser gift-sent confirmation", () => {
  it("sends the purchaser a confirmation with the recipient email, amount, and live expiry_days", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      tables: { balance_purchases: [{ id: balancePurchaseId, purchaser_user_id: purchaserUserId }] },
      userEmails: { [purchaserUserId]: "purchaser@example.com" },
      expiryDays: 45,
    });
    const confirmation = fakeGiftSentConfirmationSender();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_gift_sent", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_gift_sent",
        metadata: {
          kind: "balance_purchase",
          balance_purchase_id: balancePurchaseId,
          recipient_email: "friend@example.com",
          subtotal_cents: "2000",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: async () => {},
      sendGiftSentConfirmation: confirmation.send,
    });

    assert.equal(res.status, 200);
    assert.equal(confirmation.calls.length, 1);
    const call = confirmation.calls[0]!;
    assert.equal(call.to, "purchaser@example.com");
    assert.equal(call.recipientEmail, "friend@example.com");
    assert.equal(call.amountCents, 2000);
    assert.equal(call.expiryDays, 45);
  });

  it("self top-up: never sends a gift-sent confirmation (no recipient, structurally never reached)", async () => {
    const admin = makeFakeAdmin();
    const balancePurchaseId = randomUUID();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_self_no_confirm", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_self_no_confirm",
        metadata: { kind: "balance_purchase", balance_purchase_id: balancePurchaseId },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: neverSendEmail,
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
  });

  it("a gift-sent confirmation failure never blocks the webhook, and does not suppress the recipient's claim email", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      tables: { balance_purchases: [{ id: balancePurchaseId, purchaser_user_id: purchaserUserId }] },
      userEmails: { [purchaserUserId]: "purchaser@example.com" },
    });
    const claimEmail = fakeEmailSender();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_confirm_fail", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_confirm_fail",
        metadata: {
          kind: "balance_purchase",
          balance_purchase_id: balancePurchaseId,
          recipient_email: "friend@example.com",
          subtotal_cents: "1000",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: claimEmail.send,
      sendGiftSentConfirmation: async () => {
        throw new Error("Resend API error 500: simulated outage");
      },
    });

    assert.equal(res.status, 200);
    // The recipient's claim email, sent in its own try/catch, still went out.
    assert.equal(claimEmail.calls.length, 1);
    const completeCalls = admin.calls.filter((c) => c.fn === "service_complete_stripe_webhook_event");
    assert.equal(completeCalls.at(-1)?.args?.p_success, true);
  });

  it("a recipient claim-email failure never suppresses the purchaser's gift-sent confirmation", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      tables: { balance_purchases: [{ id: balancePurchaseId, purchaser_user_id: purchaserUserId }] },
      userEmails: { [purchaserUserId]: "purchaser@example.com" },
    });
    const confirmation = fakeGiftSentConfirmationSender();

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_claim_fail_confirm_ok", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_claim_fail_confirm_ok",
        metadata: {
          kind: "balance_purchase",
          balance_purchase_id: balancePurchaseId,
          recipient_email: "friend@example.com",
          subtotal_cents: "1000",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: async () => {
        throw new Error("Resend API error 500: simulated outage");
      },
      sendGiftSentConfirmation: confirmation.send,
    });

    assert.equal(res.status, 200);
    assert.equal(confirmation.calls.length, 1);
  });

  it("skips the confirmation without failing the webhook when the purchaser has no email on file", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      tables: { balance_purchases: [{ id: balancePurchaseId, purchaser_user_id: purchaserUserId }] },
      // No userEmails entry for purchaserUserId -- getUserById resolves to no user.
    });

    const res = await handleBalancePurchasePaymentIntentEvent({
      admin,
      event: { id: "evt_no_purchaser_email", type: "payment_intent.succeeded", livemode: false },
      intent: {
        id: "pi_no_purchaser_email",
        metadata: {
          kind: "balance_purchase",
          balance_purchase_id: balancePurchaseId,
          recipient_email: "friend@example.com",
          subtotal_cents: "1000",
        },
      },
      targetStatus: "succeeded",
      sendGiftClaimEmail: async () => {},
      sendGiftSentConfirmation: neverSendGiftSentConfirmation,
    });

    assert.equal(res.status, 200);
  });
});

describe("toBalancePurchaseWebhookAdmin", () => {
  it("forwards .rpc() to the raw client unchanged", async () => {
    const rpcCalls: RpcCall[] = [];
    const raw = {
      async rpc(fn: string, args?: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        return { data: { ok: true }, error: null };
      },
      from: () => ({}),
      auth: { admin: { async getUserById() { return { data: { user: null }, error: null }; } } },
    };

    const admin = toBalancePurchaseWebhookAdmin(raw);
    await admin.rpc("some_fn", { a: 1 });
    assert.deepEqual(rpcCalls, [{ fn: "some_fn", args: { a: 1 } }]);
  });

  it("forwards .from().update().eq().in() to the raw client", async () => {
    const calls: unknown[] = [];
    const raw = {
      rpc: async () => ({ data: null, error: null }),
      from(table: string) {
        return {
          update(patch: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                return {
                  async in(statusColumn: string, allowedValues: string[]) {
                    calls.push({ table, patch, column, value, statusColumn, allowedValues });
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      },
      auth: { admin: { async getUserById() { return { data: { user: null }, error: null }; } } },
    };

    const admin = toBalancePurchaseWebhookAdmin(raw);
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", "order-1")
      .in("status", ["created", "awaiting_payment"]);

    assert.deepEqual(calls, [
      {
        table: "payment_orders",
        patch: { status: "failed" },
        column: "id",
        value: "order-1",
        statusColumn: "status",
        allowedValues: ["created", "awaiting_payment"],
      },
    ]);
  });

  it("forwards .from().select().eq().maybeSingle() to the raw client, reshaping its result", async () => {
    const raw = {
      rpc: async () => ({ data: null, error: null }),
      from(table: string) {
        return {
          select(columns: string) {
            return {
              eq(column: string, value: string) {
                return {
                  async maybeSingle() {
                    assert.equal(table, "balance_purchases");
                    assert.equal(columns, "purchaser_user_id");
                    assert.equal(column, "id");
                    assert.equal(value, "purchase-1");
                    return { data: { purchaser_user_id: "user-1" }, error: null };
                  },
                };
              },
            };
          },
        };
      },
      auth: { admin: { async getUserById() { return { data: { user: null }, error: null }; } } },
    };

    const admin = toBalancePurchaseWebhookAdmin(raw);
    const { data, error } = await admin
      .from("balance_purchases")
      .select("purchaser_user_id")
      .eq("id", "purchase-1")
      .maybeSingle();

    assert.deepEqual(data, { purchaser_user_id: "user-1" });
    assert.equal(error, null);
  });

  it("passes auth through unchanged", async () => {
    const raw = {
      rpc: async () => ({ data: null, error: null }),
      from: () => ({}),
      auth: {
        admin: {
          async getUserById(userId: string) {
            return { data: { user: { email: `${userId}@example.com` } }, error: null };
          },
        },
      },
    };

    const admin = toBalancePurchaseWebhookAdmin(raw);
    const result = await admin.auth.admin.getUserById("user-1");
    assert.equal(result.data?.user?.email, "user-1@example.com");
  });
});
