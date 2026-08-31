/**
 * createPayment: merchant_qr_payment retirement. Run with `npm test`.
 *
 * These tests deliberately run with no Supabase/Stripe environment configured
 * (see beforeEach/afterEach below). createAdminClient() and getStripe() both
 * throw synchronously the moment they are called without their env vars set,
 * so a test that resolves cleanly -- rather than rejecting with a "not set"
 * error -- is itself proof that the code path under test never reached the
 * database or Stripe. That is what "before any database write or Stripe
 * call" is asserted against here, not a mock/spy.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import { createPayment } from "./create-payment.ts";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("createPayment: merchant_qr_payment is retired", () => {
  it("rejects with 410 retired_kind before touching Supabase or Stripe", async () => {
    const result = await createPayment({
      kind: "merchant_qr_payment",
      clientRequestId: randomUUID(),
      qrPublicCode: "SOME-QR-CODE",
      subtotalCents: 2_500,
      tipCents: 0,
      customerId: null,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 410);
    assert.equal(result.failure.category, "retired_kind");
  });

  it("rejects a well-formed retry the same way (blocked purely by kind, not by other fields)", async () => {
    const result = await createPayment({
      kind: "merchant_qr_payment",
      clientRequestId: randomUUID(),
      qrPublicCode: "ANOTHER-QR-CODE",
      subtotalCents: 10_000,
      tipCents: 500,
      customerId: randomUUID(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "retired_kind");
  });

  it("rejects even a garbage clientRequestId -- the kind check runs first", async () => {
    const result = await createPayment({
      kind: "merchant_qr_payment",
      clientRequestId: "not-a-uuid",
      qrPublicCode: "SOME-QR-CODE",
      subtotalCents: 2_500,
      customerId: null,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    // Would be "invalid_client_request_id" if the kind guard were not first.
    assert.equal(result.failure.category, "retired_kind");
  });
});

describe("createPayment: gift_certificate_purchase still dispatches", () => {
  it("reaches kind-specific validation (invalid_recipient), not the retired-kind gate", async () => {
    const result = await createPayment({
      kind: "gift_certificate_purchase",
      clientRequestId: randomUUID(),
      subtotalCents: 2_500,
      recipient: { email: "not-an-email" },
      customerId: null,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    // Proves dispatch passed the kind check and reached gift-certificate-only
    // validation, still without ever constructing a Supabase or Stripe client.
    assert.equal(result.failure.category, "invalid_recipient");
  });

  it("still rejects an invalid amount through the shared fee engine", async () => {
    const result = await createPayment({
      kind: "gift_certificate_purchase",
      clientRequestId: randomUUID(),
      subtotalCents: 0,
      recipient: { email: "person@example.com" },
      customerId: null,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "invalid_amount");
  });
});
