import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPaymentsConnected } from "@/lib/auth/business-context";

/**
 * Create a Stripe PaymentIntent for a customer paying a business by QR code.
 *
 * The mobile app scans a permanent QR (https://www.mylokala.com/pay/<public_code>)
 * and POSTs { amount, businessId } here, where `businessId` is the public_code.
 * We resolve public_code -> business owner -> Stripe connected account entirely
 * on the server, then return only the PaymentIntent client secret. The card is
 * collected and confirmed by the mobile Stripe SDK.
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
  | "qr_inactive"
  | "payment_account_not_found"
  | "no_connected_account"
  | "not_payment_ready"
  | "db_error"
  | "stripe_create_failed"
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

type PaymentAccountRow = {
  stripe_account_id: string | null;
  onboarding_status: string | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
};

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
    const admin = createAdminClient();

    // 3. Resolve the business owner id.
    let ownerId: string | null = null;

    if (UUID_RE.test(reference)) {
      // Legacy path: older clients passed the business owner's UUID directly.
      // The current schema has no separate `businesses` table, so the UUID is
      // treated as the owner id and validated against the payment account below.
      ownerId = reference;
    } else {
      // Primary path: `reference` is a QR public_code. Resolve it to its owner
      // via the service-role client (bypasses the intentional lack of an anon
      // SELECT policy on business_qr_codes). Only ACTIVE codes are usable.
      const { data: qr, error: qrError } = await admin
        .from("business_qr_codes")
        .select("business_owner_id")
        .eq("public_code", reference)
        .eq("is_active", true)
        .maybeSingle<{ business_owner_id: string }>();

      if (qrError) {
        logFailure("db_error", qrError);
        return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
      }

      if (!qr?.business_owner_id) {
        // Distinguish "no such code" from "code exists but is inactive" for the
        // server logs only; the client always gets the same generic 404.
        const { data: anyQr } = await admin
          .from("business_qr_codes")
          .select("is_active")
          .eq("public_code", reference)
          .maybeSingle<{ is_active: boolean }>();

        logFailure(anyQr ? "qr_inactive" : "qr_not_found", { reference });
        return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
      }

      ownerId = qr.business_owner_id;
    }

    // 4. Resolve the owner's Stripe connected account and confirm readiness.
    const { data: account, error: accountError } = await admin
      .from("business_payment_accounts")
      .select(
        "stripe_account_id, onboarding_status, charges_enabled, payouts_enabled",
      )
      .eq("owner_id", ownerId)
      .maybeSingle<PaymentAccountRow>();

    if (accountError) {
      logFailure("db_error", accountError);
      return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
    }

    if (!account) {
      logFailure("payment_account_not_found", { ownerId });
      return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
    }

    if (!account.stripe_account_id) {
      logFailure("no_connected_account", { ownerId });
      return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
    }

    // Payment readiness uses the same definition as the rest of the app
    // (onboarding complete + charges + payouts). A merchant mid-onboarding or
    // with charges disabled is not chargeable.
    if (!isPaymentsConnected(account)) {
      logFailure("not_payment_ready", {
        ownerId,
        onboarding_status: account.onboarding_status,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
      });
      return jsonResponse({ error: CLIENT_MESSAGE.notAvailable }, 404);
    }

    const connectedAccountId = account.stripe_account_id;

    // 5. Only now — merchant fully resolved and ready — create the intent. This
    // ordering guarantees we never fall back to charging the platform account
    // when merchant resolution fails.
    try {
      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        // Destination charge: funds route to the merchant's connected account.
        transfer_data: {
          destination: connectedAccountId,
        },
      });

      return jsonResponse({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      logFailure("stripe_create_failed", err);
      return jsonResponse({ error: CLIENT_MESSAGE.stripeFailed }, 400);
    }
  } catch (error) {
    // Unexpected failures (e.g. missing server configuration such as
    // SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY). Never leak internals.
    logFailure("server_error", error);
    return jsonResponse({ error: CLIENT_MESSAGE.serverError }, 500);
  }
}
