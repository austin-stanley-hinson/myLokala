import type { NextRequest } from "next/server";

import { resolveApiUserId } from "@/lib/auth/api-user";
import {
  refundBalancePurchase,
  type RefundBalancePurchaseFailure,
} from "@/lib/payments/refund-balance-purchase";

export const dynamic = "force-dynamic";

/**
 * POST /api/balance-purchases/[orderId]/refund -- refund a balance purchase
 * (self-top-up, or a gift not yet claimed) the caller made.
 *
 * Only the original purchaser may refund their own purchase; server-side
 * only, no client ever talks to Stripe directly. Full refund only -- there
 * is no amountCents parameter. A purchase whose credit_lot has already been
 * partially or fully spent is refused with a clear error rather than
 * partially reversed (see refund-balance-purchase.ts).
 */

const CLIENT_MESSAGE: Record<RefundBalancePurchaseFailure, string> = {
  invalid_request: "This purchase could not be found.",
  not_found: "This purchase could not be found.",
  not_refundable: "This purchase cannot be refunded.",
  already_spent: "This balance has already been used and cannot be refunded.",
  no_payment_intent: "This purchase cannot be refunded yet. Please contact support.",
  stripe_unavailable: "Could not process the refund. Please try again.",
  db_error: "Something went wrong. Please try again.",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/balance-purchases/[orderId]/refund">,
) {
  const { orderId } = await ctx.params;

  const actorId = await resolveApiUserId(req);
  if (!actorId) {
    return json({ error: "Please sign in.", code: "unauthenticated" }, 401);
  }

  let body: { reason?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await refundBalancePurchase({
    orderId,
    actorId,
    reason: typeof body.reason === "string" ? body.reason : null,
  });

  if (!result.ok) {
    return json(
      { error: CLIENT_MESSAGE[result.failure.category], code: result.failure.category },
      result.httpStatus,
    );
  }

  return json(result.refund, result.httpStatus);
}
