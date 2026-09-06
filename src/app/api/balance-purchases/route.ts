import { resolveApiUserId } from "@/lib/auth/api-user";
import {
  createBalancePurchase,
  type CreateBalancePurchaseFailure,
} from "@/lib/payments/create-balance-purchase";

export const dynamic = "force-dynamic";

/**
 * POST /api/balance-purchases — start (or idempotently replay) a gift-balance
 * purchase, self-top-up or gift. Thin wrapper: all validation, fee
 * computation, cap enforcement, and idempotency live in createBalancePurchase
 * (create-balance-purchase.ts). Never wires the webhook -- that already
 * happens independently once Stripe calls back.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

const CLIENT_MESSAGE: Record<CreateBalancePurchaseFailure, string> = {
  unexpected_fields: "Invalid request.",
  unauthenticated: "Please sign in to buy Lokala balance.",
  invalid_client_request_id: "A valid clientRequestId is required.",
  invalid_amount: "A valid amount is required.",
  invalid_recipient: "A valid recipient email is required.",
  purchase_limit_exceeded: "That amount is above the maximum single purchase.",
  wallet_unavailable: "Your account can't hold gift balance right now.",
  wallet_limit_exceeded: "That amount would put your balance over the maximum allowed.",
  already_succeeded: "This purchase has already been completed.",
  attempt_closed: "This purchase attempt is closed. Start a new one.",
  request_mismatch: "This request does not match the original purchase. Start a new one.",
  stripe_unavailable: "Could not start the purchase. Please try again.",
  db_error: "Something went wrong. Please try again.",
  server_error: "Something went wrong. Please try again.",
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body.", code: "unexpected_fields" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid request body.", code: "unexpected_fields" }, 400);
  }

  const customerId = await resolveApiUserId(req);

  const result = await createBalancePurchase({
    body: body as Record<string, unknown>,
    customerId,
  });

  if (!result.ok) {
    return json(
      { error: CLIENT_MESSAGE[result.failure.category], code: result.failure.category },
      result.httpStatus,
    );
  }

  return json(result.session, result.httpStatus);
}
