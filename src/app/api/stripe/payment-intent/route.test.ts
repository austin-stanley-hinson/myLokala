/**
 * Retired route: POST /api/stripe/payment-intent. Run with `npm test`.
 *
 * Confirms the intentional, stable retirement response and that the handler
 * never reads the request body (a malicious or stale caller cannot smuggle a
 * merchant_qr_payment attempt through here by any request shape).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST } from "./route.ts";

describe("POST /api/stripe/payment-intent (retired)", () => {
  it("always answers 410 Gone with a stable error code", async () => {
    const response = await POST();

    assert.equal(response.status, 410);
    assert.equal(response.headers.get("Cache-Control"), "no-store");

    const body = (await response.json()) as { error?: string; code?: string };
    assert.equal(body.code, "retired_kind");
    assert.equal(typeof body.error, "string");
  });

  it("answers the same way regardless of how many times it is called", async () => {
    const first = await POST();
    const second = await POST();

    assert.equal(first.status, 410);
    assert.equal(second.status, 410);
  });
});
