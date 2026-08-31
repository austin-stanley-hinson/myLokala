import { resolveApiUserId } from "@/lib/auth/api-user";
import { hashClaimToken } from "@/lib/payments/claim-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/gifts/claim — claim a pending gift by its raw token.
 *
 * The raw token is hashed here, server-side, before it ever touches a query
 * or the database -- the client-supplied value is never compared against
 * gift_claims.claim_token_hash directly, and never logged. The verified
 * session user (never a client-supplied id) is passed to
 * service_claim_pending_gift, which is the only thing that can credit a
 * wallet from a gift claim.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

type ClaimFailureCode =
  | "invalid_request"
  | "unauthenticated"
  | "invalid_token"
  | "not_pending"
  | "wallet_unavailable"
  | "server_error";

const CLIENT_MESSAGE: Record<ClaimFailureCode, string> = {
  invalid_request: "A valid claim link is required.",
  unauthenticated: "Please sign in to claim this gift.",
  invalid_token: "This claim link is invalid.",
  not_pending: "This gift has already been claimed or is no longer available.",
  wallet_unavailable: "Your account can't receive gift balance right now.",
  server_error: "Something went wrong. Please try again.",
};

function fail(code: ClaimFailureCode, status: number): Response {
  return json({ error: CLIENT_MESSAGE[code], code }, status);
}

function logClaimFailure(code: string, detail?: unknown): void {
  console.error(`[gifts.claim] ${code}`, detail ?? "");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    logClaimFailure("invalid_body", err);
    return fail("invalid_request", 400);
  }

  const claimToken =
    body && typeof body === "object" && "claimToken" in body
      ? (body as { claimToken: unknown }).claimToken
      : null;

  if (typeof claimToken !== "string" || claimToken.trim().length === 0) {
    return fail("invalid_request", 400);
  }

  const userId = await resolveApiUserId(req);
  if (!userId) {
    return fail("unauthenticated", 401);
  }

  const claimTokenHash = hashClaimToken(claimToken.trim());
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("service_claim_pending_gift", {
    p_claim_token_hash: claimTokenHash,
    p_claimant_user_id: userId,
  });

  if (error) {
    const message = error.message ?? "";
    logClaimFailure("rpc_error", { message });

    if (message.includes("Invalid claim token")) {
      return fail("invalid_token", 404);
    }
    if (message.includes("is not pending")) {
      return fail("not_pending", 409);
    }
    if (message.toLowerCase().includes("wallet")) {
      return fail("wallet_unavailable", 409);
    }
    return fail("server_error", 500);
  }

  const result = data as { status?: string; idempotent?: boolean } | null;
  return json({ status: result?.status ?? "claimed", idempotent: Boolean(result?.idempotent) });
}
