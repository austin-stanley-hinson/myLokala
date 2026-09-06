/**
 * Merchant setup RPC-wrapper tests. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hubForLocation, type PaymentHubRow } from "./setup.ts";

function hub(
  over: Partial<PaymentHubRow> & Pick<PaymentHubRow, "id" | "status">,
): PaymentHubRow {
  return {
    created_at: "2026-01-01T00:00:00Z",
    disabled_at: null,
    merchant_account_id: "m-1",
    merchant_location_id: "loc-1",
    public_code: "code",
    rotated_from_id: null,
    ...over,
  };
}

describe("hubForLocation", () => {
  it("prefers the active hub for a location", () => {
    const hubs = [
      hub({ id: "old", status: "disabled", public_code: "old" }),
      hub({ id: "live", status: "active", public_code: "live" }),
    ];
    assert.equal(hubForLocation(hubs, "loc-1")?.id, "live");
  });

  it("falls back to the last hub when none are active", () => {
    const hubs = [
      hub({ id: "a", status: "disabled" }),
      hub({ id: "b", status: "disabled" }),
    ];
    assert.equal(hubForLocation(hubs, "loc-1")?.id, "b");
  });

  it("returns null when the location has no hubs", () => {
    assert.equal(hubForLocation([hub({ id: "x", status: "active" })], "other"), null);
  });
});
