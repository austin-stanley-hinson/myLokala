/**
 * Redemption at a merchant's QR code (public.redeem_lokala_balance,
 * migration 20260901000009). SERVER-ONLY.
 *
 * redeem_lokala_balance is a plain-named function granted to `authenticated`
 * (not a service_* wrapper): it derives the customer entirely from
 * auth.uid() inside Postgres, so it must be called through a client that
 * carries the caller's own session (the cookie-bound createTypedClient()),
 * never the service-role admin client -- there is no parameter to pass a
 * customer id explicitly, unlike service_claim_pending_gift. That is also
 * why this module is not itself unit-tested against a live DB the way
 * create-balance-purchase.ts is against a fake admin: the `redeem` dependency
 * here is a thin RPC-calling closure the route builds from a real session
 * client, mirroring how resolvePaymentHub (lib/merchant/setup.ts) is used
 * un-mocked and instead verified by pgTAP + the manual walkthrough. What IS
 * fully unit-tested here is everything that does not require a live
 * database: request validation, error-message mapping, and the
 * fresh-vs-idempotent-replay response shaping.
 *
 * The client never computes or sends a total: only subtotalCents and
 * tipCents (and the public code + idempotency id) ever leave the browser.
 * redeem_lokala_balance alone computes the fee, the debit, and the merchant
 * payable, under its own row locks -- this module never recomputes or
 * second-guesses that math, only relays validated inputs and reshapes the
 * result.
 *
 * redeem_lokala_balance's own idempotency (unique(customer_user_id,
 * client_request_id), with a matching exception handler) is the sole
 * mechanism preventing a double debit on retry; this module does not add a
 * second layer, only surfaces `idempotent` distinctly so the UI can show
 * "already confirmed" rather than a fresh success message.
 */

export type RedemptionFailureCode =
  | "invalid_request"
  | "unauthenticated"
  | "hub_unavailable"
  | "merchant_not_active"
  | "merchant_not_connect_ready"
  | "wallet_unavailable"
  | "insufficient_balance"
  | "server_error";

/** Server-side diagnostic detail. Never returned to a client. */
export type RedemptionDiagnostic = {
  category: RedemptionFailureCode;
  detail?: unknown;
};

// ---------------------------------------------------------------------------
// Request validation. Only these four keys are ever read; anything else is
// rejected before the RPC is ever touched. There is no "totalCents" key --
// structurally, the client cannot send a precomputed total.
// ---------------------------------------------------------------------------

const ALLOWED_BODY_KEYS = new Set([
  "publicCode",
  "subtotalCents",
  "tipCents",
  "clientRequestId",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidatedRedemptionRequest = {
  publicCode: string;
  subtotalCents: number;
  tipCents: number;
  clientRequestId: string;
};

export type ValidateRedemptionRequestResult =
  | { ok: true; value: ValidatedRedemptionRequest }
  | { ok: false; failure: "invalid_request" };

export function validateRedemptionRequestBody(
  body: Record<string, unknown>,
): ValidateRedemptionRequestResult {
  const unexpectedKeys = Object.keys(body).filter(
    (key) => !ALLOWED_BODY_KEYS.has(key),
  );
  if (unexpectedKeys.length > 0) {
    return { ok: false, failure: "invalid_request" };
  }

  const publicCode = body.publicCode;
  if (typeof publicCode !== "string" || publicCode.trim().length === 0) {
    return { ok: false, failure: "invalid_request" };
  }

  const subtotalCents = body.subtotalCents;
  if (
    typeof subtotalCents !== "number" ||
    !Number.isInteger(subtotalCents) ||
    subtotalCents <= 0
  ) {
    return { ok: false, failure: "invalid_request" };
  }

  const rawTip = body.tipCents ?? 0;
  if (typeof rawTip !== "number" || !Number.isInteger(rawTip) || rawTip < 0) {
    return { ok: false, failure: "invalid_request" };
  }

  const clientRequestId = body.clientRequestId;
  if (typeof clientRequestId !== "string" || !UUID_RE.test(clientRequestId)) {
    return { ok: false, failure: "invalid_request" };
  }

  return {
    ok: true,
    value: {
      publicCode: publicCode.trim(),
      subtotalCents,
      tipCents: rawTip,
      clientRequestId,
    },
  };
}

// ---------------------------------------------------------------------------
// redeem_lokala_balance error-message mapping. Every raise exception message
// in the function (migration 20260901000009), verified directly against its
// source rather than assumed. Order matters only in that each needle is
// distinct enough not to collide with another.
// ---------------------------------------------------------------------------

const ERROR_MESSAGE_MAP: Array<[needle: string, code: RedemptionFailureCode]> = [
  ["Authentication required", "unauthenticated"],
  ["Payment hub is not available", "hub_unavailable"],
  ["Merchant is not accepting payments", "merchant_not_active"],
  ["Merchant Stripe Connect account is not ready", "merchant_not_connect_ready"],
  ["Wallet is not available", "wallet_unavailable"],
  ["Insufficient balance", "insufficient_balance"],
];

export function mapRedemptionRpcErrorMessage(message: string): RedemptionFailureCode {
  for (const [needle, code] of ERROR_MESSAGE_MAP) {
    if (message.includes(needle)) return code;
  }
  // Covers subtotal/tip/client_request_id validation exceptions (should
  // never fire -- validateRedemptionRequestBody already rejects those shapes
  // before the RPC is called) and the "Insufficient credit lots" invariant
  // exception -- neither is a state the client can act on distinctly.
  return "server_error";
}

// ---------------------------------------------------------------------------
// RPC result shaping.
// ---------------------------------------------------------------------------

type RedemptionRpcRow = {
  id: string;
  confirmation_code: string;
  merchant_display_name?: string | null;
  subtotal_cents: number;
  tip_cents: number;
  balance_debited_cents: number;
  merchant_fee_cents: number;
  merchant_payable_cents: number;
  currency: string;
  status: string;
  idempotent: boolean;
};

function asRedemptionRow(data: unknown): RedemptionRpcRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.confirmation_code !== "string" ||
    typeof record.subtotal_cents !== "number" ||
    typeof record.tip_cents !== "number" ||
    typeof record.balance_debited_cents !== "number" ||
    typeof record.merchant_fee_cents !== "number" ||
    typeof record.merchant_payable_cents !== "number" ||
    typeof record.currency !== "string" ||
    typeof record.status !== "string" ||
    typeof record.idempotent !== "boolean"
  ) {
    return null;
  }
  return record as unknown as RedemptionRpcRow;
}

export type RedemptionConfirmation = {
  redemptionId: string;
  confirmationCode: string;
  merchantDisplayName: string;
  subtotalCents: number;
  tipCents: number;
  balanceDebitedCents: number;
  merchantFeeCents: number;
  merchantPayableCents: number;
  currency: string;
  status: string;
  /** True when this response is a replay of an earlier successful call for
   * the same client_request_id -- no new debit happened. */
  idempotent: boolean;
  /** Null only if the post-redemption wallet lookup itself failed -- the
   * redemption already succeeded either way; this is purely for display. */
  remainingWalletBalanceCents: number | null;
};

export type RedeemBalanceCaller = (args: {
  p_public_code: string;
  p_subtotal_cents: number;
  p_tip_cents: number;
  p_client_request_id: string;
}) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export type RedeemBalanceDeps = {
  redeem: RedeemBalanceCaller;
  /** Looks up the merchant's display name for a response that omitted it.
   * redeem_lokala_balance's idempotent-replay branches (both the pre-check
   * and the unique_violation exception handler) do not include
   * merchant_display_name -- only the fresh-success branch does -- so a
   * replay needs this fallback to still show the merchant's name. */
  resolveMerchantDisplayName: (publicCode: string) => Promise<string | null>;
  /** Current wallet balance for the authenticated caller, post-redemption. */
  getWalletBalanceCents: () => Promise<number | null>;
};

export type RedeemBalanceResult =
  | { ok: true; confirmation: RedemptionConfirmation }
  | { ok: false; failure: RedemptionDiagnostic };

export async function redeemBalance(
  request: ValidatedRedemptionRequest,
  deps: RedeemBalanceDeps,
): Promise<RedeemBalanceResult> {
  const { data, error } = await deps.redeem({
    p_public_code: request.publicCode,
    p_subtotal_cents: request.subtotalCents,
    p_tip_cents: request.tipCents,
    p_client_request_id: request.clientRequestId,
  });

  if (error) {
    return {
      ok: false,
      failure: { category: mapRedemptionRpcErrorMessage(error.message ?? ""), detail: error },
    };
  }

  const row = asRedemptionRow(data);
  if (!row) {
    return { ok: false, failure: { category: "server_error", detail: { data } } };
  }

  const merchantDisplayName =
    row.merchant_display_name ?? (await deps.resolveMerchantDisplayName(request.publicCode));

  const remainingWalletBalanceCents = await deps.getWalletBalanceCents();

  return {
    ok: true,
    confirmation: {
      redemptionId: row.id,
      confirmationCode: row.confirmation_code,
      merchantDisplayName: merchantDisplayName ?? "the merchant",
      subtotalCents: row.subtotal_cents,
      tipCents: row.tip_cents,
      balanceDebitedCents: row.balance_debited_cents,
      merchantFeeCents: row.merchant_fee_cents,
      merchantPayableCents: row.merchant_payable_cents,
      currency: row.currency,
      status: row.status,
      idempotent: row.idempotent,
      remainingWalletBalanceCents,
    },
  };
}
