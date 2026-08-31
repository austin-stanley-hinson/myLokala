import { createHash, randomBytes } from "node:crypto";

/**
 * Gift claim token hashing. SERVER-ONLY.
 *
 * gift_claims.claim_token_hash stores only this hash, never the raw token
 * (see migration 20260901000004's comment: "token hash only"). Both writers
 * of a hash -- the webhook issuing a fresh token
 * (balance-purchase-webhook.ts) and the claim route looking one up
 * (api/gifts/claim/route.ts) -- call this same function, so there is exactly
 * one place that could get the algorithm wrong instead of two copies that
 * could silently drift apart.
 */

export function generateRawClaimToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
