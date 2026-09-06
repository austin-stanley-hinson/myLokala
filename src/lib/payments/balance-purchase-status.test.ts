/**
 * buildBalancePurchaseStatusResponse. Run with `npm test`.
 *
 * Proves the status endpoint's response shape never carries a Stripe field
 * and never confirms another user's order exists.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBalancePurchaseStatusResponse } from "./balance-purchase-status.ts";

const OWNER_ID = "owner-1";

describe("buildBalancePurchaseStatusResponse", () => {
  it("returns only status/amount fields for the owning user", () => {
    const result = buildBalancePurchaseStatusResponse(
      {
        user_id: OWNER_ID,
        status: "paid",
        subtotal_cents: 1000,
        customer_fee_cents: 125,
        total_cents: 1125,
        currency: "USD",
      },
      OWNER_ID,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(Object.keys(result.body).sort(), [
      "currency",
      "customerFeeCents",
      "status",
      "subtotalCents",
      "totalCents",
    ]);
    assert.equal(result.body.status, "paid");
    assert.equal(result.body.totalCents, 1125);
  });

  it("never includes a Stripe-shaped field even if the row had extra properties", () => {
    const row = {
      user_id: OWNER_ID,
      status: "paid",
      subtotal_cents: 1000,
      customer_fee_cents: 125,
      total_cents: 1125,
      currency: "USD",
      // A row can never actually carry these (no such columns on
      // payment_orders), but even if something upstream leaked them in,
      // this function must not forward them.
      stripe_payment_intent_id: "pi_should_never_appear",
      stripe_client_secret: "secret_should_never_appear",
    };

    const result = buildBalancePurchaseStatusResponse(row, OWNER_ID);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.body);
    assert.equal(serialized.includes("pi_should_never_appear"), false);
    assert.equal(serialized.includes("secret_should_never_appear"), false);
  });

  it("returns not_found (never the row) for a different user's order", () => {
    const result = buildBalancePurchaseStatusResponse(
      {
        user_id: "someone-else",
        status: "paid",
        subtotal_cents: 1000,
        customer_fee_cents: 125,
        total_cents: 1125,
        currency: "USD",
      },
      OWNER_ID,
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 404);
    assert.equal(result.code, "not_found");
  });

  it("returns the identical not_found response for a nonexistent order (no existence leak)", () => {
    const forOwner = buildBalancePurchaseStatusResponse(null, OWNER_ID);
    const forOther = buildBalancePurchaseStatusResponse(
      { user_id: "someone-else", status: "paid", subtotal_cents: 1, customer_fee_cents: 0, total_cents: 1, currency: "USD" },
      OWNER_ID,
    );
    assert.deepEqual(forOwner, forOther);
  });
});
