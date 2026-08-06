import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { resolveApiUserId } from "@/lib/auth/api-user";
import { createPayment } from "@/lib/payments/create-payment";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DEPRECATED — create a Stripe PaymentIntent for a customer paying a business
 * by QR code. Superseded by POST /api/payments.
 *
 * Kept alive only so the currently deployed mobile build keeps working. It now
 * delegates to the durable payment service, so every charge it starts is
 * recorded in `payment_transactions` and finalized by the Stripe webhook. It no
 * longer talks to Stripe directly, and it can no longer create a charge that
 * Lokala has no ledger row for.
 *
 * The wire contract is unchanged: POST { amount (DOLLARS), businessId } and the
 * response is still exactly { clientSecret }, with generic error copy and
 * `Cache-Control: no-store` on every path.
 *
 * Two limitations are inherent to the old contract and are why callers should
 * migrate:
 *   * Old clients send no clientRequestId, so one is generated per request. A
 *     network retry therefore creates a NEW attempt instead of resuming the
 *     existing one. Only /api/payments is retry-safe.
 *   * `amount` arrives as dollars and is converted here; /api/payments takes
 *     integer cents and never has to round.
 *
 * Why the SERVICE ROLE (admin) client: `business_qr_codes` has no anon SELECT
 * policy and `business_payment_accounts` is readable only by its owning
 * business. An anon/session client therefore cannot resolve a scanned QR to a
 * merchant, which is what made this route fail (404) for the mobile app. The
 * admin client performs these trusted lookups server-side without weakening RLS.
 * None of the resolved internal identifiers (owner id, connected account id) are
 * ever returned to the client.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server-side diagnostic categories. These are logged (never returned to the
// client) so we can tell apart the different failure modes in production logs.
type FailureCategory =
  | "invalid_amount"
  | "invalid_business_ref"
  | "invalid_body"
  | "qr_not_found"
  | "legacy_uuid_unresolved"
  | "not_available"
  | "create_failed"
  | "server_error";

function logFailure(category: FailureCategory, detail?: unknown): void {
  // Keep sensitive detail on the server only.
  console.error(`[payment-intent] ${category}`, detail ?? "");
}

// Every response from this route carries a Stripe client secret or a
// payment-related error, so none of it may be cached by the browser or any
// shared/CDN cache. Centralize the JSON + no-store header here so success and
// error paths stay consistent.
function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// Generic, non-revealing client messages. Server logs carry the real category.
const CLIENT_MESSAGE = {
  invalidAmount: "A positive amount is required.",
  invalidBusinessRef: "A valid business reference is required.",
  invalidBody: "Invalid request body.",
  notAvailable: "This business is not available to accept payments right now.",
  stripeFailed: "Could not start the payment. Please try again.",
  serverError: "Something went wrong. Please try again.",
} as const;

/**
 * Legacy callers could pass the business owner's UUID instead of a QR code.
 * Translate it to that owner's active public_code so the durable service still
 * only ever resolves payments through a QR code.
 */
async function publicCodeForOwnerId(ownerId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("business_qr_codes")
    .select("public_code")
    .eq("business_owner_id", ownerId)
    .eq("is_active", true)
    .maybeSingle<{ public_code: string }>();

  return data?.public_code ?? null;
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (err) {
      logFailure("invalid_body", err);
      return jsonResponse({ error: CLIENT_MESSAGE.invalidBody }, 400);
    }

    const { amount, businessId } = (body ?? {}) as {
      amount?: unknown;
      businessId?: unknown;
    };

    // 1. Validate + normalize the amount (dollars -> integer cents).
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      logFailure("invalid_amount", { amount });
      return jsonResponse({ error: CLIENT_MESSAGE.invalidAmount }, 400);
    }

    const amountCents = Math.round(amount * 100);
    if (amountCents < 1) {
      logFailure("invalid_amount", { amount, amountCents });
      return jsonResponse({ error: CLIENT_MESSAGE.invalidAmount }, 400);
    }

    // 2. Validate the business reference (public_code or legacy UUID).
    if (typeof businessId !== "string" || businessId.trim().length === 0) {
      logFailure("invalid_business_ref", { businessId });
      return jsonResponse({ error: CLIENT_MESSAGE.invalidBusinessRef }, 400);
    }

    const reference = businessId.trim();
    let qrPublicCode = reference;

    if (UUID_RE.test(reference)) {
      const resolved = await publicCodeForOwnerId(reference);
      if (!resolved) {
        logFailure("legacy_uuid_unresolved", { reference });
        return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
      }
      qrPublicCode = resolved;
    }

    // 3. Delegate to the durable service: it resolves the merchant, computes
    //    fees, writes the pending ledger row, then creates one PaymentIntent.
    //
    //    The whole amount is treated as the subtotal with no tip, because the
    //    old contract has no way to express a tip. Fee policy is applied
    //    server-side exactly as it is for /api/payments.
    const result = await createPayment({
      kind: "merchant_qr_payment",
      // Old clients cannot supply one, so each request is its own attempt.
      clientRequestId: randomUUID(),
      qrPublicCode,
      subtotalCents: amountCents,
      tipCents: 0,
      paymentMethod: "card",
      customerId: await resolveApiUserId(req),
    });

    if (!result.ok) {
      const category = result.failure.category;
      logFailure(
        category === "merchant_unavailable" ? "not_available" : "create_failed",
        result.failure.detail ?? { category },
      );

      if (category === "merchant_unavailable") {
        return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
      }
      if (category === "invalid_amount" || category === "invalid_request") {
        return jsonResponse({ error: CLIENT_MESSAGE.invalidAmount }, 400);
      }
      return jsonResponse({ error: CLIENT_MESSAGE.stripeFailed }, 400);
    }

    // Response shape is deliberately unchanged for the deployed mobile build.
    return jsonResponse({ clientSecret: result.session.clientSecret });
  } catch (error) {
    // Unexpected failures (e.g. missing server configuration such as
    // SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY). Never leak internals.
    logFailure("server_error", error);
    return jsonResponse({ error: CLIENT_MESSAGE.serverError }, 500);
  }
}
