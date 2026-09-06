import { timingSafeEqual } from "node:crypto";

/**
 * Authorization for the settlement admin routes (batch/transfer). These
 * move real money to real merchants and must never be reachable by an
 * ordinary authenticated user -- there is no merchant- or customer-facing
 * reason to call them, so this is a single shared secret, not a role check
 * against merchant_members or any user session.
 *
 * SETTLEMENT_ADMIN_SECRET must be set server-side only. A missing secret
 * fails closed (every request rejected), never open.
 */
export function isAuthorizedSettlementAdminRequest(req: Request): boolean {
  const expected = process.env.SETTLEMENT_ADMIN_SECRET;
  if (!expected) return false;

  const authorization = req.headers.get("authorization");
  const provided = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  // timingSafeEqual throws on mismatched lengths rather than just returning
  // false, and the length itself must not leak via a fast rejection either
  // -- compare against a same-length buffer first, unconditionally.
  if (expectedBuf.length !== providedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}
