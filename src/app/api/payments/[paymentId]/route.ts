import type { NextRequest } from "next/server";

import { resolveApiUserId } from "@/lib/auth/api-user";
import { logPaymentFailure, paymentJson } from "@/lib/payments/http";
import { getPaymentReceipt } from "@/lib/payments/receipt";

/**
 * GET /api/payments/[paymentId] — the canonical status of a payment.
 *
 * This is what a client should trust, not the result the Stripe SDK handed the
 * device: the ledger is only advanced by the signature-verified webhook, so this
 * answer survives the app closing, a lost network, or a lying client.
 *
 * Authentication is required. A payment is visible to the customer who made it
 * and the merchant who received it; anyone else gets 404 rather than 403, since
 * a 403 would confirm the id exists. The response body is a fixed, narrow shape
 * that carries no connected-account id, no owner or customer UUID, no Stripe
 * PaymentIntent or charge id, no client secret, and no raw Stripe error text.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/payments/[paymentId]">,
) {
  try {
    const { paymentId } = await ctx.params;

    const viewerId = await resolveApiUserId(req);
    if (!viewerId) {
      return paymentJson(
        { error: "Authentication is required.", code: "unauthenticated" },
        401,
      );
    }

    const receipt = await getPaymentReceipt(paymentId, viewerId);
    if (!receipt) {
      return paymentJson({ error: "Payment not found.", code: "not_found" }, 404);
    }

    return paymentJson(receipt);
  } catch (error) {
    logPaymentFailure("payment-status", "server_error", error);
    return paymentJson(
      { error: "Something went wrong. Please try again.", code: "server_error" },
      500,
    );
  }
}
