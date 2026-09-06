import { resolveApiUserId } from "@/lib/auth/api-user";
import {
  buildBalancePurchaseStatusResponse,
  type PaymentOrderStatusRow,
} from "@/lib/payments/balance-purchase-status";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/balance-purchases/[orderId] — canonical, webhook-confirmed status
 * for a balance-purchase payment_orders row, for the buy-balance UI to poll.
 *
 * Deliberately over payment_orders/balance_purchases, NOT the legacy
 * /api/payments/[paymentId] (payment_transactions). Response shape is built
 * by buildBalancePurchaseStatusResponse (balance-purchase-status.ts), which
 * exposes only status + the amounts already quoted at checkout -- never a
 * Stripe id or any other internal field -- and never confirms an order
 * belonging to someone else exists.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await ctx.params;

  if (!UUID_RE.test(orderId)) {
    return json({ error: "We could not find this purchase.", code: "not_found" }, 404);
  }

  const userId = await resolveApiUserId(req);
  if (!userId) {
    return json({ error: "Please sign in.", code: "unauthenticated" }, 401);
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_orders")
    .select("user_id, status, subtotal_cents, customer_fee_cents, total_cents, currency")
    .eq("id", orderId)
    .maybeSingle<PaymentOrderStatusRow>();

  const result = buildBalancePurchaseStatusResponse(data ?? null, userId);

  if (!result.ok) {
    return json({ error: "We could not find this purchase.", code: result.code }, result.httpStatus);
  }

  return json(result.body, result.httpStatus);
}
