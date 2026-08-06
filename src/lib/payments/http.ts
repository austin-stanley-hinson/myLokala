import { NextResponse } from "next/server";

import type { CreatePaymentFailure } from "@/lib/payments/create-payment";

/**
 * Shared response helpers for the payment API.
 *
 * Every payment response either carries a Stripe client secret or a
 * payment-related error, so none of it may be cached by the browser or any
 * shared/CDN cache. Same `no-store` guarantee the merchant payment-intent route
 * established.
 */
export function paymentJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Generic, non-revealing client copy. Server logs carry the real category and
 * detail; the client never sees a raw Stripe or Postgres message.
 */
const CLIENT_MESSAGE: Record<CreatePaymentFailure, string> = {
  invalid_request: "Invalid request.",
  invalid_amount: "A valid amount is required.",
  invalid_client_request_id: "A valid clientRequestId is required.",
  invalid_recipient: "A valid recipient email is required.",
  merchant_unavailable:
    "This business is not available to accept payments right now.",
  already_succeeded: "This payment has already been completed.",
  attempt_closed: "This payment attempt is closed. Start a new one.",
  request_mismatch:
    "This request does not match the original payment. Start a new one.",
  stripe_unavailable: "Could not start the payment. Please try again.",
  db_error: "Something went wrong. Please try again.",
  server_error: "Something went wrong. Please try again.",
};

export function clientMessageFor(code: CreatePaymentFailure): string {
  return CLIENT_MESSAGE[code] ?? CLIENT_MESSAGE.server_error;
}

/** Log server-side only. Detail may contain Stripe/Postgres internals. */
export function logPaymentFailure(
  scope: string,
  code: string,
  detail?: unknown,
): void {
  console.error(`[${scope}] ${code}`, detail ?? "");
}
