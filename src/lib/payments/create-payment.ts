import type Stripe from "stripe";

import { getStripe } from "../stripe/server.ts";
import { createAdminClient } from "../supabase/admin.ts";
import {
  type FeeBreakdown,
  type PaymentKind,
  type PaymentMethod,
  quotePayment,
} from "./fees.ts";

/**
 * Durable payment creation. SERVER-ONLY.
 *
 * `merchant_qr_payment` (a direct destination charge to a business at the
 * point of redemption) is retired: it conflicts with the gift-balance wallet
 * architecture, where redemption debits a wallet rather than charging a card.
 * `createPayment` now only ever creates a `gift_certificate_purchase`; a
 * `merchant_qr_payment` request is refused before any resolution, DB write, or
 * Stripe call. The ordering below is what remains load-bearing:
 *
 *   1. compute every fee on the server from the subtotal and tip alone;
 *   2. write the pending ledger row BEFORE Stripe, so a charge can never exist
 *      that Lokala has no record of;
 *   3. create exactly one PaymentIntent, keyed off client_request_id.
 *
 * Idempotency has two independent layers. `payment_transactions
 * .client_request_id` is UNIQUE, so N concurrent requests collapse to one row.
 * The Stripe idempotency key is derived from that same id, so even if our row
 * update loses a race, Stripe returns the SAME PaymentIntent instead of
 * creating a second one. A retry can therefore never double-charge.
 *
 * Uses the service-role client because `payment_transactions` intentionally
 * has no client write policy.
 */

export type CreatePaymentFailure =
  | "invalid_request"
  | "invalid_amount"
  | "invalid_client_request_id"
  | "invalid_recipient"
  | "merchant_unavailable"
  | "already_succeeded"
  | "attempt_closed"
  | "request_mismatch"
  | "stripe_unavailable"
  | "db_error"
  | "server_error"
  | "retired_kind";

/** Server-side diagnostic detail. Never returned to a client. */
export type CreatePaymentDiagnostic = {
  category: CreatePaymentFailure;
  detail?: unknown;
};

export type CreatePaymentInput = {
  kind: PaymentKind;
  clientRequestId: string;
  subtotalCents: number;
  tipCents?: number;
  paymentMethod?: PaymentMethod;
  /** Required for merchant_qr_payment. */
  qrPublicCode?: string | null;
  /** Required for gift_certificate_purchase. */
  recipient?: {
    email: string;
    name?: string | null;
    note?: string | null;
  } | null;
  /** Verified user id, or null for an anonymous/guest payment. */
  customerId: string | null;
};

export type PaymentSession = {
  paymentId: string;
  status: PaymentStatus;
  kind: PaymentKind;
  subtotalCents: number;
  tipCents: number;
  customerFeeCents: number;
  merchantFeeCents: number;
  totalCents: number;
  currency: string;
  feePolicyVersion: string;
  businessName: string | null;
  /** Omitted once the payment is terminal -- a settled payment is not retryable. */
  clientSecret: string | null;
};

export type CreatePaymentResult =
  | { ok: true; httpStatus: 200 | 201; session: PaymentSession }
  | { ok: false; httpStatus: number; failure: CreatePaymentDiagnostic };

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TransactionRow = {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  customer_id: string | null;
  business_owner_id: string | null;
  qr_public_code: string | null;
  business_name_snapshot: string | null;
  gift_certificate_id: string | null;
  subtotal_cents: number;
  tip_cents: number;
  customer_fee_cents: number;
  merchant_fee_cents: number;
  application_fee_cents: number;
  charged_cents: number;
  currency: string;
  fee_policy_version: string;
  stripe_payment_intent_id: string | null;
};

const TRANSACTION_COLUMNS =
  "id, kind, status, customer_id, business_owner_id, qr_public_code, " +
  "business_name_snapshot, gift_certificate_id, subtotal_cents, tip_cents, " +
  "customer_fee_cents, merchant_fee_cents, application_fee_cents, charged_cents, " +
  "currency, fee_policy_version, stripe_payment_intent_id";

type MerchantTarget = {
  businessOwnerId: string;
  connectedAccountId: string;
  businessName: string | null;
};

function fail(
  httpStatus: number,
  category: CreatePaymentFailure,
  detail?: unknown,
): CreatePaymentResult {
  return { ok: false, httpStatus, failure: { category, detail } };
}

/** Deterministic Stripe idempotency key: one attempt can only ever make one intent. */
function stripeIdempotencyKey(clientRequestId: string): string {
  return `lokala_pay_${clientRequestId}`;
}

function toSession(
  row: TransactionRow,
  clientSecret: string | null,
): PaymentSession {
  return {
    paymentId: row.id,
    status: row.status,
    kind: row.kind,
    subtotalCents: row.subtotal_cents,
    tipCents: row.tip_cents,
    customerFeeCents: row.customer_fee_cents,
    merchantFeeCents: row.merchant_fee_cents,
    totalCents: row.charged_cents,
    currency: row.currency,
    feePolicyVersion: row.fee_policy_version,
    businessName: row.business_name_snapshot,
    clientSecret,
  };
}

// Merchant resolution (QR public_code -> connected account) lived here for
// merchant_qr_payment. Retired along with that kind -- see the module
// docstring. `MerchantTarget` and `target` below stay (always null) because
// isMismatchedReplay and the payment_transactions row shape still key off
// them; a live business_owner_id on a row can only mean a pre-retirement
// merchant_qr_payment, which a gift_certificate_purchase replay must not match.

/** True when the replayed request does not describe the same payment. */
function isMismatchedReplay(
  row: TransactionRow,
  quote: FeeBreakdown,
  target: MerchantTarget | null,
  customerId: string | null,
): boolean {
  if (row.kind !== quote.kind) return true;
  if (row.subtotal_cents !== quote.subtotalCents) return true;
  if (row.tip_cents !== quote.tipCents) return true;
  if (row.charged_cents !== quote.chargedCents) return true;
  if ((row.business_owner_id ?? null) !== (target?.businessOwnerId ?? null)) {
    return true;
  }
  // An anonymous replay of an owned payment must not be honored.
  if (row.customer_id !== null && row.customer_id !== customerId) return true;
  return false;
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const { kind, clientRequestId, customerId } = input;

  if (kind !== "merchant_qr_payment" && kind !== "gift_certificate_purchase") {
    return fail(400, "invalid_request", { kind });
  }

  // Retired: direct card-at-the-counter destination charges conflict with the
  // gift-balance wallet architecture. Refuse before any resolution, DB write,
  // or Stripe call -- this is the only place a new merchant_qr_payment attempt
  // can be created, so blocking it here closes every caller at once, including
  // a stale client that still constructs this request by hand. Historical rows
  // (refunds, receipts) are untouched; only new creation is retired.
  if (kind === "merchant_qr_payment") {
    return fail(410, "retired_kind", { kind });
  }

  if (typeof clientRequestId !== "string" || !UUID_RE.test(clientRequestId)) {
    return fail(400, "invalid_client_request_id");
  }

  const paymentMethod: PaymentMethod = input.paymentMethod ?? "card";
  const tipCents = input.tipCents ?? 0;

  // Fees are always computed here, never accepted from the caller.
  let quote: FeeBreakdown;
  try {
    quote = quotePayment({
      kind,
      subtotalCents: input.subtotalCents,
      tipCents,
      paymentMethod,
    });
  } catch (err) {
    return fail(400, "invalid_amount", err);
  }

  const recipientEmail = input.recipient?.email?.trim() ?? "";
  if (kind === "gift_certificate_purchase" && !EMAIL_RE.test(recipientEmail)) {
    return fail(400, "invalid_recipient");
  }

  // merchant_qr_payment is retired above, so `kind` is always
  // gift_certificate_purchase here and there is never a merchant destination
  // to resolve. `target` stays typed as MerchantTarget | null (rather than
  // dropped) because isMismatchedReplay and the insert below still key off it.
  const target: MerchantTarget | null = null;

  const admin = createAdminClient();

  // Claim the attempt. UNIQUE(client_request_id) means concurrent duplicates
  // collapse to a single row; the losers read the winner below.
  const { data: inserted, error: insertError } = await admin
    .from("payment_transactions")
    .insert({
      client_request_id: clientRequestId,
      kind,
      customer_id: customerId,
      business_owner_id: null,
      qr_public_code: null,
      business_name_snapshot: null,
      subtotal_cents: quote.subtotalCents,
      tip_cents: quote.tipCents,
      credit_cents: 0,
      customer_fee_cents: quote.customerFeeCents,
      merchant_fee_cents: quote.merchantFeeCents,
      application_fee_cents: quote.applicationFeeCents,
      charged_cents: quote.chargedCents,
      merchant_net_cents: quote.merchantNetCents,
      currency: quote.currency,
      fee_policy_version: quote.feePolicyVersion,
      status: "pending",
    })
    .select(TRANSACTION_COLUMNS)
    .maybeSingle<TransactionRow>();

  let row: TransactionRow | null = inserted ?? null;

  if (insertError) {
    // 23505 = unique violation on client_request_id: this is a replay.
    if (insertError.code !== "23505") {
      return fail(500, "db_error", insertError);
    }
    const { data: existing, error: selectError } = await admin
      .from("payment_transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("client_request_id", clientRequestId)
      .maybeSingle<TransactionRow>();

    if (selectError || !existing) {
      return fail(500, "db_error", selectError);
    }
    row = existing;
  }

  if (!row) {
    return fail(500, "db_error", { reason: "no row after insert" });
  }

  // A replay must describe the same payment, or we refuse rather than risk
  // charging the first amount for a second request.
  if (isMismatchedReplay(row, quote, target, customerId)) {
    return fail(409, "request_mismatch", { paymentId: row.id });
  }

  // Terminal states are never retryable and never hand back a client secret.
  if (row.status === "succeeded") {
    return fail(409, "already_succeeded", { paymentId: row.id });
  }
  if (row.status === "failed" || row.status === "canceled") {
    return fail(409, "attempt_closed", { paymentId: row.id, status: row.status });
  }

  const stripe = getStripe();

  // Replay with an intent already attached: return the SAME session.
  if (row.stripe_payment_intent_id) {
    try {
      const existingIntent = await stripe.paymentIntents.retrieve(
        row.stripe_payment_intent_id,
      );
      return {
        ok: true,
        httpStatus: 200,
        session: toSession(row, existingIntent.client_secret ?? null),
      };
    } catch (err) {
      return fail(502, "stripe_unavailable", err);
    }
  }

  // First time through: create exactly one PaymentIntent.
  let intent: Stripe.PaymentIntent;
  try {
    const params: Stripe.PaymentIntentCreateParams = {
      amount: quote.chargedCents,
      currency: quote.currency,
      // Inline methods only, so mobile and web confirm without a return_url.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        payment_transaction_id: row.id,
        client_request_id: clientRequestId,
        kind,
        fee_policy_version: quote.feePolicyVersion,
        subtotal_cents: String(quote.subtotalCents),
        tip_cents: String(quote.tipCents),
        customer_fee_cents: String(quote.customerFeeCents),
        merchant_fee_cents: String(quote.merchantFeeCents),
        ...(kind === "gift_certificate_purchase"
          ? { recipient_email: recipientEmail }
          : {}),
      },
    };

    // Gift purchases are PLATFORM charges with no connected account, so no
    // transfer_data/application_fee_amount is sent (Stripe rejects a fee
    // without a destination). Lokala's cut is still recorded on the ledger.
    // The destination-charge branch (merchant_qr_payment) is retired above.

    intent = await stripe.paymentIntents.create(params, {
      idempotencyKey: stripeIdempotencyKey(clientRequestId),
    });
  } catch (err) {
    // The pending row stays; a retry with the same id resumes here, and
    // reconciliation cancels it if the customer never comes back.
    return fail(502, "stripe_unavailable", err);
  }

  // Attach the intent. Guarded so a concurrent winner is never overwritten.
  const { data: updated } = await admin
    .from("payment_transactions")
    .update({
      stripe_payment_intent_id: intent.id,
      livemode: intent.livemode,
    })
    .eq("id", row.id)
    .is("stripe_payment_intent_id", null)
    .select(TRANSACTION_COLUMNS)
    .maybeSingle<TransactionRow>();

  const finalRow = updated ?? row;

  // Gift purchases need their certificate row, keyed by the intent id so the
  // webhook can find it. Unique on stripe_payment_intent_id, so a replay is a
  // no-op rather than a duplicate gift.
  if (kind === "gift_certificate_purchase" && !finalRow.gift_certificate_id) {
    const { data: gift } = await admin
      .from("gift_certificates")
      .insert({
        buyer_id: customerId,
        recipient_email: recipientEmail,
        recipient_name: input.recipient?.name?.trim() || null,
        amount_cents: quote.subtotalCents,
        fee_cents: quote.customerFeeCents,
        total_cents: quote.chargedCents,
        currency: quote.currency,
        note: input.recipient?.note?.trim() || null,
        payment_method: paymentMethod,
        stripe_payment_intent_id: intent.id,
        status: "pending",
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (gift?.id) {
      await admin
        .from("payment_transactions")
        .update({ gift_certificate_id: gift.id })
        .eq("id", finalRow.id);
      finalRow.gift_certificate_id = gift.id;
    }
  }

  return {
    ok: true,
    httpStatus: 201,
    session: toSession(finalRow, intent.client_secret ?? null),
  };
}
