/**
 * Balance-purchase status response shaping. SERVER-ONLY, pure.
 *
 * The one job of this module: decide exactly what a status-poll response
 * contains. It must never contain a Stripe id, a Stripe status string, or
 * any other internal field -- only what the buy-balance UI needs to render
 * (status, and the amounts already quoted to the customer at checkout).
 * Also never confirms a payment_orders row's existence to anyone but its
 * owner -- a wrong or someone-else's orderId gets the identical "not_found"
 * a nonexistent one does.
 */

export type PaymentOrderStatusRow = {
  user_id: string;
  status: string;
  subtotal_cents: number;
  customer_fee_cents: number;
  total_cents: number;
  currency: string;
};

export type BalancePurchaseStatusBody = {
  status: string;
  subtotalCents: number;
  customerFeeCents: number;
  totalCents: number;
  currency: string;
};

export type BalancePurchaseStatusResult =
  | { ok: true; httpStatus: 200; body: BalancePurchaseStatusBody }
  | { ok: false; httpStatus: 404; code: "not_found" };

export function buildBalancePurchaseStatusResponse(
  row: PaymentOrderStatusRow | null,
  requestingUserId: string,
): BalancePurchaseStatusResult {
  if (!row || row.user_id !== requestingUserId) {
    return { ok: false, httpStatus: 404, code: "not_found" };
  }

  return {
    ok: true,
    httpStatus: 200,
    body: {
      status: row.status,
      subtotalCents: row.subtotal_cents,
      customerFeeCents: row.customer_fee_cents,
      totalCents: row.total_cents,
      currency: row.currency,
    },
  };
}
