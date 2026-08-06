import type { NextRequest } from "next/server";

import { resolveApiUserId } from "@/lib/auth/api-user";
import { logPaymentFailure, paymentJson } from "@/lib/payments/http";
import { type RefundFailure, refundPayment } from "@/lib/payments/refund";

/**
 * POST /api/payments/[paymentId]/refund — refund a merchant QR payment.
 *
 * Refunds are server-side only; no client ever talks to Stripe for this. The
 * caller must be the merchant who received the payment, and must supply a
 * `refundRequestId` (uuid) which makes the operation idempotent: replaying the
 * same id reports the recorded result rather than refunding a second time.
 *
 * Omit `amountCents` for a full refund of the remaining balance, or pass an
 * integer-cents amount for a partial one. The running total can never exceed
 * what was charged.
 */

const CLIENT_MESSAGE: Record<RefundFailure, string> = {
  invalid_request: "A valid refundRequestId and amount are required.",
  not_found: "Payment not found.",
  not_refundable: "This payment cannot be refunded.",
  amount_exceeds_charge: "The refund amount exceeds the remaining balance.",
  not_permitted: "Payment not found.",
  stripe_unavailable: "Could not process the refund. Please try again.",
  db_error: "Something went wrong. Please try again.",
};

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/payments/[paymentId]/refund">,
) {
  try {
    const { paymentId } = await ctx.params;

    const actorId = await resolveApiUserId(req);
    if (!actorId) {
      return paymentJson(
        { error: "Authentication is required.", code: "unauthenticated" },
        401,
      );
    }

    let body: {
      amountCents?: unknown;
      refundRequestId?: unknown;
      reason?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const amountCents =
      typeof body.amountCents === "number" ? body.amountCents : null;

    const result = await refundPayment({
      paymentId,
      amountCents,
      refundRequestId:
        typeof body.refundRequestId === "string" ? body.refundRequestId : "",
      reason: typeof body.reason === "string" ? body.reason : null,
      actorId,
    });

    if (!result.ok) {
      logPaymentFailure("refund", result.failure.category, result.failure.detail);
      return paymentJson(
        {
          error: CLIENT_MESSAGE[result.failure.category],
          code: result.failure.category,
        },
        result.httpStatus,
      );
    }

    return paymentJson(result.refund, result.httpStatus);
  } catch (error) {
    logPaymentFailure("refund", "server_error", error);
    return paymentJson(
      { error: "Something went wrong. Please try again.", code: "server_error" },
      500,
    );
  }
}
