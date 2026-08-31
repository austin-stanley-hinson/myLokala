import { resolvePaymentHub } from "@/lib/merchant/setup";
import {
  redeemBalance,
  validateRedemptionRequestBody,
  type RedemptionFailureCode,
} from "@/lib/payments/redeem-balance";
import { createTypedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/redemptions — redeem Lokala balance at a merchant's QR code.
 *
 * Uses the COOKIE-BOUND session client (createTypedClient()), never the
 * service-role admin client: redeem_lokala_balance derives the customer from
 * auth.uid() inside Postgres, so the call must carry the signed-in customer's
 * own session for that to resolve at all. See redeem-balance.ts's module
 * docstring for why this is the one purchase-style endpoint in this codebase
 * that works this way.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

const CLIENT_MESSAGE: Record<RedemptionFailureCode, string> = {
  invalid_request: "A valid amount is required.",
  unauthenticated: "Please sign in to redeem Lokala balance.",
  hub_unavailable:
    "This payment code isn't active. Ask the business for their current Lokala QR code.",
  merchant_not_active: "This business isn't accepting Lokala payments right now.",
  merchant_not_connect_ready: "This business hasn't finished payment setup yet.",
  wallet_unavailable: "Your Lokala wallet isn't available right now.",
  insufficient_balance: "Your Lokala balance isn't enough to cover this amount.",
  server_error: "Something went wrong. Please try again.",
};

const STATUS_FOR_FAILURE: Record<RedemptionFailureCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  hub_unavailable: 404,
  merchant_not_active: 409,
  merchant_not_connect_ready: 409,
  wallet_unavailable: 409,
  insufficient_balance: 400,
  server_error: 500,
};

function logRedemptionFailure(code: string, detail?: unknown): void {
  console.error(`[redemptions] ${code}`, detail ?? "");
}

function fail(failure: RedemptionFailureCode): Response {
  return json({ error: CLIENT_MESSAGE[failure], code: failure }, STATUS_FOR_FAILURE[failure]);
}

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch (err) {
    logRedemptionFailure("invalid_body", err);
    return fail("invalid_request");
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return fail("invalid_request");
  }

  const validated = validateRedemptionRequestBody(rawBody as Record<string, unknown>);
  if (!validated.ok) {
    return fail(validated.failure);
  }

  const supabase = await createTypedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("unauthenticated");
  }

  const result = await redeemBalance(validated.value, {
    redeem: (args) => supabase.rpc("redeem_lokala_balance", args),
    async resolveMerchantDisplayName(publicCode) {
      const hub = await resolvePaymentHub(supabase, publicCode);
      return hub?.merchantDisplayName ?? null;
    },
    async getWalletBalanceCents() {
      const { data } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", user.id)
        .eq("currency", "USD")
        .maybeSingle();
      return data?.balance_cents ?? null;
    },
  });

  if (!result.ok) {
    logRedemptionFailure(result.failure.category, result.failure.detail);
    return fail(result.failure.category);
  }

  return json(result.confirmation, result.confirmation.idempotent ? 200 : 201);
}
