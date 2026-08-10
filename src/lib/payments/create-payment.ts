import type Stripe from "stripe";

import { isPaymentsConnected } from "@/lib/auth/business-context";
import { connectedAccountUsableInMode } from "@/lib/stripe/connect-readiness";
import { getStripe, isStripePlatformLive } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type FeeBreakdown,
  type PaymentKind,
  type PaymentMethod,
  quotePayment,
} from "@/lib/payments/fees";

/**
 * Durable payment creation. SERVER-ONLY.
 *
 * The single path that money starts on, for both payment kinds. The ordering is
 * deliberate and is the whole point of the service:
 *
 *   1. resolve and validate the merchant (QR payments) BEFORE touching Stripe,
 *      so a resolution failure can never fall back to charging the platform;
 *   2. compute every fee on the server from the subtotal and tip alone;
 *   3. write the pending ledger row BEFORE Stripe, so a charge can never exist
 *      that Lokala has no record of;
 *   4. create exactly one PaymentIntent, keyed off client_request_id.
 *
 * Idempotency has two independent layers. `payment_transactions
 * .client_request_id` is UNIQUE, so N concurrent requests collapse to one row.
 * The Stripe idempotency key is derived from that same id, so even if our row
 * update loses a race, Stripe returns the SAME PaymentIntent instead of
 * creating a second one. A retry can therefore never double-charge.
 *
 * Uses the service-role client because `business_qr_codes` and
 * `business_payment_accounts` intentionally have no anon SELECT policy, and
 * `payment_transactions` intentionally has no client write policy. No internal
 * identifier resolved here (owner id, connected account id) is ever returned.
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
  | "server_error";

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

/**
 * Resolve a scanned QR public_code to its merchant and connected account, and
 * confirm the merchant can actually accept a charge. Uses the same readiness
 * definition as the rest of the app.
 */
async function resolveMerchantTarget(
  publicCode: string,
): Promise<{ ok: true; target: MerchantTarget } | { ok: false }> {
  const admin = createAdminClient();

  const { data: qr, error: qrError } = await admin
    .from("business_qr_codes")
    .select("business_owner_id")
    .eq("public_code", publicCode)
    .eq("is_active", true)
    .maybeSingle<{ business_owner_id: string }>();

  if (qrError || !qr?.business_owner_id) {
    return { ok: false };
  }

  const ownerId = qr.business_owner_id;

  const { data: account, error: accountError } = await admin
    .from("business_payment_accounts")
    .select(
      "stripe_account_id, onboarding_status, charges_enabled, payouts_enabled, livemode",
    )
    .eq("owner_id", ownerId)
    .maybeSingle<{
      stripe_account_id: string | null;
      onboarding_status: string | null;
      charges_enabled: boolean | null;
      payouts_enabled: boolean | null;
      livemode: boolean | null;
    }>();

  let platformLive: boolean;
  try {
    platformLive = isStripePlatformLive();
  } catch {
    return { ok: false };
  }

  if (
    accountError ||
    !account?.stripe_account_id ||
    !isPaymentsConnected(account) ||
    !connectedAccountUsableInMode(account.livemode, platformLive)
  ) {
    return { ok: false };
  }

  // Snapshot the merchant name: a customer cannot SELECT the merchant's
  // profiles row under RLS, so a receipt must not depend on that join.
  const { data: profile } = await admin
    .from("profiles")
    .select("business_name")
    .eq("id", ownerId)
    .maybeSingle<{ business_name: string | null }>();

  return {
    ok: true,
    target: {
      businessOwnerId: ownerId,
      connectedAccountId: account.stripe_account_id,
      businessName: profile?.business_name?.trim() || "Local business",
    },
  };
}

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

  // Merchant resolution happens BEFORE Stripe, so we never charge without a
  // confirmed, payment-ready destination.
  let target: MerchantTarget | null = null;
  if (kind === "merchant_qr_payment") {
    const publicCode = input.qrPublicCode?.trim() ?? "";
    if (!publicCode) {
      return fail(400, "invalid_request", { reason: "missing qrPublicCode" });
    }
    const resolved = await resolveMerchantTarget(publicCode);
    if (!resolved.ok) {
      return fail(404, "merchant_unavailable", { publicCode });
    }
    target = resolved.target;
  }

  const admin = createAdminClient();

  // Claim the attempt. UNIQUE(client_request_id) means concurrent duplicates
  // collapse to a single row; the losers read the winner below.
  const { data: inserted, error: insertError } = await admin
    .from("payment_transactions")
    .insert({
      client_request_id: clientRequestId,
      kind,
      customer_id: customerId,
      business_owner_id: target?.businessOwnerId ?? null,
      qr_public_code:
        kind === "merchant_qr_payment" ? (input.qrPublicCode?.trim() ?? null) : null,
      business_name_snapshot: target?.businessName ?? null,
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

    if (target) {
      // Destination charge: funds route to the merchant's connected account and
      // Lokala retains both fee sides as the Connect application fee.
      params.transfer_data = { destination: target.connectedAccountId };
      params.application_fee_amount = quote.applicationFeeCents;
    }
    // Gift purchases are PLATFORM charges with no connected account, so no
    // application_fee_amount is sent (Stripe rejects it without a destination).
    // Lokala's cut is still recorded on the ledger.

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
