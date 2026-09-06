/**
 * Claim-token hashing. Run with `npm test`.
 *
 * Locks in exactly the security property Part 2 requires: a lookup is
 * always keyed by the hash, is deterministic (so the same raw token always
 * resolves the same row), and the hash never equals or trivially contains
 * the raw token.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateRawClaimToken, hashClaimToken } from "./claim-token.ts";

describe("hashClaimToken", () => {
  it("is deterministic: the same raw token always hashes to the same value", () => {
    const raw = "a-fixed-raw-token-for-this-test";
    assert.equal(hashClaimToken(raw), hashClaimToken(raw));
  });

  it("produces a 64-character hex sha256 digest", () => {
    assert.match(hashClaimToken("anything"), /^[0-9a-f]{64}$/);
  });

  it("never equals or contains the raw token it was derived from", () => {
    const raw = "super-secret-raw-claim-token-value";
    const hash = hashClaimToken(raw);
    assert.notEqual(hash, raw);
    assert.equal(hash.includes(raw), false);
  });

  it("different raw tokens hash to different values", () => {
    assert.notEqual(hashClaimToken("token-a"), hashClaimToken("token-b"));
  });
});

describe("generateRawClaimToken", () => {
  it("generates a long, high-entropy, unpredictable token each call", () => {
    const a = generateRawClaimToken();
    const b = generateRawClaimToken();
    assert.notEqual(a, b);
    // 32 random bytes as hex = 64 characters.
    assert.match(a, /^[0-9a-f]{64}$/);
  });
});
