import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import {
  mapRedemptionRpcErrorMessage,
  redeemBalance,
  validateRedemptionRequestBody,
  type RedeemBalanceCaller,
  type RedeemBalanceDeps,
} from "./redeem-balance.ts";

const VALID_BODY = {
  publicCode: "abc123",
  subtotalCents: 1500,
  tipCents: 200,
  clientRequestId: randomUUID(),
};

describe("validateRedemptionRequestBody", () => {
  it("accepts a well-formed request", () => {
    const result = validateRedemptionRequestBody(VALID_BODY);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.publicCode, "abc123");
      assert.equal(result.value.subtotalCents, 1500);
      assert.equal(result.value.tipCents, 200);
      assert.equal(result.value.clientRequestId, VALID_BODY.clientRequestId);
    }
  });

  it("defaults tipCents to 0 when omitted", () => {
    const { tipCents: _omit, ...withoutTip } = VALID_BODY;
    const result = validateRedemptionRequestBody(withoutTip);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.tipCents, 0);
  });

  it("rejects an unexpected body key -- e.g. a client-supplied total", () => {
    const result = validateRedemptionRequestBody({ ...VALID_BODY, totalCents: 1700 });
    assert.deepEqual(result, { ok: false, failure: "invalid_request" });
  });

  it("rejects a missing or blank publicCode", () => {
    assert.equal(validateRedemptionRequestBody({ ...VALID_BODY, publicCode: "" }).ok, false);
    const { publicCode: _omit, ...withoutCode } = VALID_BODY;
    assert.equal(validateRedemptionRequestBody(withoutCode).ok, false);
  });

  it("rejects a non-positive or non-integer subtotalCents", () => {
    assert.equal(validateRedemptionRequestBody({ ...VALID_BODY, subtotalCents: 0 }).ok, false);
    assert.equal(validateRedemptionRequestBody({ ...VALID_BODY, subtotalCents: -100 }).ok, false);
    assert.equal(validateRedemptionRequestBody({ ...VALID_BODY, subtotalCents: 15.5 }).ok, false);
    assert.equal(validateRedemptionRequestBody({ ...VALID_BODY, subtotalCents: "1500" }).ok, false);
  });

  it("rejects a negative or non-integer tipCents", () => {
    assert.equal(validateRedemptionRequestBody({ ...VALID_BODY, tipCents: -1 }).ok, false);
    assert.equal(validateRedemptionRequestBody({ ...VALID_BODY, tipCents: 1.5 }).ok, false);
  });

  it("rejects a non-UUID clientRequestId", () => {
    assert.equal(
      validateRedemptionRequestBody({ ...VALID_BODY, clientRequestId: "not-a-uuid" }).ok,
      false,
    );
  });
});

describe("mapRedemptionRpcErrorMessage", () => {
  const cases: Array<[string, string]> = [
    ["Authentication required", "unauthenticated"],
    ["Payment hub is not available", "hub_unavailable"],
    ["Merchant is not accepting payments", "merchant_not_active"],
    [
      "Merchant Stripe Connect account is not ready for current platform mode (livemode=false)",
      "merchant_not_connect_ready",
    ],
    ["Wallet is not available", "wallet_unavailable"],
    ["Insufficient balance", "insufficient_balance"],
  ];

  for (const [message, code] of cases) {
    it(`maps "${message}" to ${code}`, () => {
      assert.equal(mapRedemptionRpcErrorMessage(message), code);
    });
  }

  it("falls back to server_error for an unrecognized message", () => {
    assert.equal(mapRedemptionRpcErrorMessage("Insufficient credit lots for debit (invariant failure)"), "server_error");
    assert.equal(mapRedemptionRpcErrorMessage("something totally unexpected"), "server_error");
  });
});

function freshRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    confirmation_code: "ABCD1234",
    merchant_display_name: "Fresh Pork",
    subtotal_cents: 1500,
    tip_cents: 200,
    balance_debited_cents: 1700,
    merchant_fee_cents: 75,
    merchant_payable_cents: 1625,
    currency: "USD",
    status: "completed",
    idempotent: false,
    ...over,
  };
}

function makeDeps(over: Partial<RedeemBalanceDeps> = {}): RedeemBalanceDeps & {
  redeemCalls: Array<Parameters<RedeemBalanceCaller>[0]>;
} {
  const redeemCalls: Array<Parameters<RedeemBalanceCaller>[0]> = [];
  return {
    redeemCalls,
    redeem: async (args) => {
      redeemCalls.push(args);
      return { data: freshRow(), error: null };
    },
    resolveMerchantDisplayName: async () => {
      throw new Error("resolveMerchantDisplayName should not be called for this test");
    },
    getWalletBalanceCents: async () => 8300,
    ...over,
  };
}

const REQUEST = {
  publicCode: "abc123",
  subtotalCents: 1500,
  tipCents: 200,
  clientRequestId: randomUUID(),
};

describe("redeemBalance: server-only total computation", () => {
  it("passes only the validated subtotal/tip through to the RPC -- never a total", async () => {
    const deps = makeDeps();
    await redeemBalance(REQUEST, deps);

    assert.equal(deps.redeemCalls.length, 1);
    const call = deps.redeemCalls[0]!;
    assert.equal(call.p_public_code, "abc123");
    assert.equal(call.p_subtotal_cents, 1500);
    assert.equal(call.p_tip_cents, 200);
    assert.equal(call.p_client_request_id, REQUEST.clientRequestId);
    assert.equal("p_total_cents" in call, false);
  });

  it("shapes a fresh success using the RPC's own fee/debit/payable math, not a recomputation", async () => {
    const deps = makeDeps();
    const result = await redeemBalance(REQUEST, deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.confirmation.subtotalCents, 1500);
    assert.equal(result.confirmation.tipCents, 200);
    assert.equal(result.confirmation.balanceDebitedCents, 1700);
    assert.equal(result.confirmation.merchantFeeCents, 75);
    assert.equal(result.confirmation.merchantPayableCents, 1625);
    assert.equal(result.confirmation.merchantDisplayName, "Fresh Pork");
    assert.equal(result.confirmation.idempotent, false);
    assert.equal(result.confirmation.remainingWalletBalanceCents, 8300);
  });
});

describe("redeemBalance: idempotent replay", () => {
  it("surfaces idempotent:true using the original row's amounts, and does not treat it as an error", async () => {
    const deps = makeDeps({
      redeem: async () => ({
        data: freshRow({ idempotent: true, merchant_display_name: null }),
        error: null,
      }),
      resolveMerchantDisplayName: async (publicCode) => {
        assert.equal(publicCode, "abc123");
        return "Fresh Pork";
      },
    });

    const result = await redeemBalance(REQUEST, deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.confirmation.idempotent, true);
    assert.equal(result.confirmation.confirmationCode, "ABCD1234");
    assert.equal(result.confirmation.balanceDebitedCents, 1700);
    assert.equal(result.confirmation.merchantDisplayName, "Fresh Pork");
  });

  it("falls back to a generic label if the merchant name cannot be resolved on replay", async () => {
    const deps = makeDeps({
      redeem: async () => ({
        data: freshRow({ idempotent: true, merchant_display_name: null }),
        error: null,
      }),
      resolveMerchantDisplayName: async () => null,
    });

    const result = await redeemBalance(REQUEST, deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.confirmation.merchantDisplayName, "the merchant");
  });
});

describe("redeemBalance: distinct error states", () => {
  const errorCases: Array<[string, string]> = [
    ["Payment hub is not available", "hub_unavailable"],
    ["Merchant is not accepting payments", "merchant_not_active"],
    [
      "Merchant Stripe Connect account is not ready for current platform mode (livemode=false)",
      "merchant_not_connect_ready",
    ],
    ["Wallet is not available", "wallet_unavailable"],
    ["Insufficient balance", "insufficient_balance"],
  ];

  for (const [message, code] of errorCases) {
    it(`surfaces ${code} distinctly, without touching the wallet-balance lookup`, async () => {
      const deps = makeDeps({
        redeem: async () => ({ data: null, error: { message } }),
        getWalletBalanceCents: async () => {
          throw new Error("getWalletBalanceCents should not be called on failure");
        },
      });

      const result = await redeemBalance(REQUEST, deps);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failure.category, code);
    });
  }

  it("falls back to server_error for a malformed/unrecognized RPC row", async () => {
    const deps = makeDeps({
      redeem: async () => ({ data: { unexpected: "shape" }, error: null }),
      getWalletBalanceCents: async () => {
        throw new Error("getWalletBalanceCents should not be called on failure");
      },
    });

    const result = await redeemBalance(REQUEST, deps);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failure.category, "server_error");
  });
});
