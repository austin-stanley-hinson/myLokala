import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseBatchMerchantResult,
  runSettlementBatching,
  type SettlementBatchingDeps,
  type PendingSettlementMerchant,
} from "./batch.ts";

function batchedRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    status: "batched",
    settlement_batch_id: "batch-1",
    redemption_count: 2,
    gross_subtotal_cents: 6000,
    tips_cents: 500,
    merchant_fees_cents: 150,
    net_payable_cents: 6350,
    currency: "USD",
    ...over,
  };
}

describe("parseBatchMerchantResult: fee math is passed through, never recomputed", () => {
  it("carries gross/tips/fees/net exactly as the RPC returned them", () => {
    const outcome = parseBatchMerchantResult(batchedRow(), "merchant-1");
    assert.equal(outcome.status, "batched");
    if (outcome.status !== "batched") return;
    assert.equal(outcome.grossSubtotalCents, 6000);
    assert.equal(outcome.tipsCents, 500);
    assert.equal(outcome.merchantFeesCents, 150);
    assert.equal(outcome.netPayableCents, 6350);
    assert.equal(outcome.redemptionCount, 2);
    assert.equal(outcome.settlementBatchId, "batch-1");
  });

  it("passes through not_ready and nothing_to_settle without alteration", () => {
    assert.deepEqual(parseBatchMerchantResult({ status: "not_ready" }, "m-1"), {
      status: "not_ready",
      merchantAccountId: "m-1",
    });
    assert.deepEqual(parseBatchMerchantResult({ status: "nothing_to_settle" }, "m-1"), {
      status: "nothing_to_settle",
      merchantAccountId: "m-1",
    });
  });

  it("throws on an incomplete 'batched' result rather than silently substituting a value", () => {
    assert.throws(() => parseBatchMerchantResult(batchedRow({ net_payable_cents: undefined }), "m-1"));
  });

  it("throws on an unrecognized status", () => {
    assert.throws(() => parseBatchMerchantResult({ status: "something_else" }, "m-1"));
  });
});

function makeDeps(
  merchants: PendingSettlementMerchant[],
  batchResults: Record<string, unknown | (() => unknown)>,
): SettlementBatchingDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listPendingMerchants() {
      return merchants;
    },
    async batchMerchant(merchantAccountId: string) {
      calls.push(merchantAccountId);
      const result = batchResults[merchantAccountId];
      if (typeof result === "function") return (result as () => unknown)();
      return result;
    },
  };
}

describe("runSettlementBatching: not-ready merchants are reported, not dropped", () => {
  it("puts a not_ready merchant in summary.notReady, distinct from batched/nothingToSettle", async () => {
    const deps = makeDeps(
      [
        { merchantAccountId: "ready-1", pendingRedemptionCount: 2 },
        { merchantAccountId: "not-ready-1", pendingRedemptionCount: 1 },
      ],
      {
        "ready-1": batchedRow({ settlement_batch_id: "b-ready-1" }),
        "not-ready-1": { status: "not_ready" },
      },
    );

    const summary = await runSettlementBatching(deps);

    assert.equal(summary.batched.length, 1);
    assert.equal(summary.batched[0]!.merchantAccountId, "ready-1");
    assert.equal(summary.notReady.length, 1);
    assert.equal(summary.notReady[0]!.merchantAccountId, "not-ready-1");
    assert.equal(summary.errors.length, 0);
  });
});

describe("runSettlementBatching: partial-failure isolation across merchants", () => {
  it("one merchant throwing does not block or omit another merchant's successful batch", async () => {
    const deps = makeDeps(
      [
        { merchantAccountId: "m-a", pendingRedemptionCount: 1 },
        { merchantAccountId: "m-b-broken", pendingRedemptionCount: 1 },
        { merchantAccountId: "m-c", pendingRedemptionCount: 1 },
      ],
      {
        "m-a": batchedRow({ settlement_batch_id: "batch-a" }),
        "m-b-broken": () => {
          throw new Error("simulated RPC failure for m-b-broken");
        },
        "m-c": batchedRow({ settlement_batch_id: "batch-c" }),
      },
    );

    const summary = await runSettlementBatching(deps);

    // All three merchants were attempted -- the broken one did not stop the loop.
    assert.deepEqual(deps.calls, ["m-a", "m-b-broken", "m-c"]);

    assert.equal(summary.batched.length, 2);
    assert.deepEqual(
      summary.batched.map((b) => b.merchantAccountId).sort(),
      ["m-a", "m-c"],
    );

    assert.equal(summary.errors.length, 1);
    assert.equal(summary.errors[0]!.merchantAccountId, "m-b-broken");
    assert.match(summary.errors[0]!.message, /simulated RPC failure/);
  });
});

describe("runSettlementBatching: idempotent batching surfaces nothing_to_settle distinctly", () => {
  it("a merchant with nothing left to batch is reported separately from batched/notReady", async () => {
    const deps = makeDeps(
      [{ merchantAccountId: "m-done", pendingRedemptionCount: 0 }],
      { "m-done": { status: "nothing_to_settle" } },
    );

    const summary = await runSettlementBatching(deps);

    assert.equal(summary.nothingToSettle.length, 1);
    assert.equal(summary.batched.length, 0);
    assert.equal(summary.notReady.length, 0);
  });
});
