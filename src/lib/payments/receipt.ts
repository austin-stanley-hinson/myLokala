import { createAdminClient } from "@/lib/supabase/admin";

import type { PaymentStatus } from "@/lib/payments/create-payment";

/**
 * Canonical customer-facing receipt for a payment. SERVER-ONLY.
 *
 * Deliberately narrow: this is the exact shape allowed to leave the server. It
 * omits every internal identifier -- the Stripe connected-account id, the
 * business owner's UUID, the customer's UUID, the Stripe PaymentIntent and
 * charge ids, and raw Stripe or Postgres error text. Only Stripe's
 * machine-readable failure code is exposed, so nothing quotable leaks.
 */
export type PaymentReceipt = {
  paymentId: string;
  kind: string;
  status: PaymentStatus;
  subtotalCents: number;
  tipCents: number;
  customerFeeCents: number;
  totalCents: number;
  currency: string;
  feePolicyVersion: string;
  businessName: string | null;
  refundStatus: string;
  refundedCents: number;
  failureCode: string | null;
  createdAt: string;
  succeededAt: string | null;
  refundedAt: string | null;
};

type ReceiptRow = {
  id: string;
  kind: string;
  status: PaymentStatus;
  customer_id: string | null;
  business_owner_id: string | null;
  subtotal_cents: number;
  tip_cents: number;
  customer_fee_cents: number;
  charged_cents: number;
  currency: string;
  fee_policy_version: string;
  business_name_snapshot: string | null;
  refund_status: string;
  refunded_cents: number;
  failure_code: string | null;
  created_at: string;
  succeeded_at: string | null;
  refunded_at: string | null;
};

const RECEIPT_COLUMNS =
  "id, kind, status, customer_id, business_owner_id, subtotal_cents, tip_cents, " +
  "customer_fee_cents, charged_cents, currency, fee_policy_version, " +
  "business_name_snapshot, refund_status, refunded_cents, failure_code, " +
  "created_at, succeeded_at, refunded_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toReceipt(row: ReceiptRow): PaymentReceipt {
  return {
    paymentId: row.id,
    kind: row.kind,
    status: row.status,
    subtotalCents: row.subtotal_cents,
    tipCents: row.tip_cents,
    customerFeeCents: row.customer_fee_cents,
    totalCents: row.charged_cents,
    currency: row.currency,
    feePolicyVersion: row.fee_policy_version,
    businessName: row.business_name_snapshot,
    refundStatus: row.refund_status,
    refundedCents: row.refunded_cents,
    failureCode: row.failure_code,
    createdAt: row.created_at,
    succeededAt: row.succeeded_at,
    refundedAt: row.refunded_at,
  };
}

/**
 * Fetch a receipt, authorizing the viewer against the row itself.
 *
 * A payment is visible to the customer who made it and to the merchant who
 * received it, and to nobody else. An unauthorized or unknown id both return
 * null so the caller answers 404 either way -- a 403 would confirm the id
 * exists.
 *
 * Rows with a null customer_id (anonymous payments taken before mobile always
 * authenticates) are readable only by the receiving merchant. That is the safe
 * default: an unowned payment must not become readable by any signed-in user.
 */
export async function getPaymentReceipt(
  paymentId: string,
  viewerId: string,
): Promise<PaymentReceipt | null> {
  if (!UUID_RE.test(paymentId)) {
    return null;
  }

  const { data, error } = await createAdminClient()
    .from("payment_transactions")
    .select(RECEIPT_COLUMNS)
    .eq("id", paymentId)
    .maybeSingle<ReceiptRow>();

  if (error || !data) {
    return null;
  }

  const isCustomer = data.customer_id !== null && data.customer_id === viewerId;
  const isMerchant =
    data.business_owner_id !== null && data.business_owner_id === viewerId;

  if (!isCustomer && !isMerchant) {
    return null;
  }

  return toReceipt(data);
}
