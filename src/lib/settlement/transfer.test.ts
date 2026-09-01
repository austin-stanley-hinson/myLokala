import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runSettlementTransfer, type ClaimableBatch, type SettlementTransferDeps } from "./transfer.ts";

function batch(over: Partial<ClaimableBatch> = {}): ClaimableBatch {
  return { id: "batch-1", merchantAccountId: "merchant-1", netPayableCents: 6350, currency: "USD", ...over };
}

function neverCall(name: string) {
  return async () => {
    throw new Error(`${name} should not be called for this test`);
  };
}

type DepsOverrides = Partial<SettlementTransferDeps> & {
  batches?: ClaimableBatch[];
  claimable?: Record<string, boolean>;
  connectedAccounts?: Record<string, string>;
  attemptCounts?: Record<string, number>;
  transferOutcomes?: Record<string, { stripeTransferId: string } | Error>;
};

function makeDeps(overrides: DepsOverrides = {}): SettlementTransferDeps & {
  recorded: Array<Record<string, unknown>>;
  paid: string[];
  failed: string[];
  transferCalls: Array<Record<string, unknown>>;
} {
  const recorded: Array<Record<string, unknown>> = [];
  const paid: string[] = [];
  const failedIds: string[] = [];
  const transferCalls: Array<Record<string, unknown>> = [];

  const batches = overrides.batches ?? [batch()];
  const claimable = overrides.claimable ?? Object.fromEntries(batches.map((b) => [b.id, true]));
  const connectedAccounts = overrides.connectedAccounts ?? Object.fromEntries(
    batches.map((b) => [b.merchantAccountId, `acct_${b.merchantAccountId}`]),
  );
  const attemptCounts = overrides.attemptCounts ?? {};
  const transferOutcomes = overrides.transferOutcomes ?? {};

  return {
    recorded,
    paid,
    failed: failedIds,
    transferCalls,
    async listClaimableBatches(batchId?: string) {
      return batchId ? batches.filter((b) => b.id === batchId) : batches;
    },
    async claimBatchForProcessing(batchId: string) {
      return claimable[batchId] ?? false;
    },
    async getPlatformLivemode() {
      return false;
    },
    async getConnectedAccountId(merchantAccountId: string) {
      return connectedAccounts[merchantAccountId] ?? null;
    },
    async countExistingAttempts(settlementBatchId: string) {
      return attemptCounts[settlementBatchId] ?? 0;
    },
    async createTransfer(args) {
      transferCalls.push(args);
      const outcome = transferOutcomes[args.settlementBatchId];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? { stripeTransferId: `tr_${args.settlementBatchId}` };
    },
    async recordAttempt(args) {
      recorded.push(args);
    },
    async markBatchPaid(batchId: string) {
      paid.push(batchId);
    },
    async markBatchFailed(batchId: string) {
      failedIds.push(batchId);
    },
    ...overrides,
  };
}

describe("runSettlementTransfer: idempotent transfer execution", () => {
  it("skips a batch that is not claimable (already processing/paid) without ever calling Stripe", async () => {
    const deps = makeDeps({ claimable: { "batch-1": false } });
    deps.createTransfer = neverCall("createTransfer") as typeof deps.createTransfer;

    const summary = await runSettlementTransfer(deps);

    assert.equal(summary.skipped.length, 1);
    assert.equal(summary.skipped[0]!.settlementBatchId, "batch-1");
    assert.equal(summary.transferred.length, 0);
    assert.equal(deps.transferCalls.length, 0);
  });

  it("a fresh pending batch is claimed, transferred once, and marked paid", async () => {
    const deps = makeDeps();

    const summary = await runSettlementTransfer(deps);

    assert.equal(summary.transferred.length, 1);
    assert.equal(summary.transferred[0]!.stripeTransferId, "tr_batch-1");
    assert.equal(summary.transferred[0]!.amountCents, 6350);
    assert.deepEqual(deps.paid, ["batch-1"]);
    assert.equal(deps.transferCalls.length, 1);
    assert.equal(deps.transferCalls[0]!.idempotencyKey, "lokala_settlement_transfer_batch-1_1");
  });

  it("re-running the transfer step for an already-paid batch finds nothing claimable (batch not listed)", async () => {
    // A 'paid' batch is never returned by listClaimableBatches in the first
    // place (status filter is pending|failed) -- simulating that directly.
    const deps = makeDeps({ batches: [] });
    deps.createTransfer = neverCall("createTransfer") as typeof deps.createTransfer;

    const summary = await runSettlementTransfer(deps);

    assert.deepEqual(summary, { transferred: [], skipped: [], failed: [] });
  });
});

describe("runSettlementTransfer: a failed transfer is recorded and left retriable", () => {
  it("records a failed attempt, marks the batch failed, and never marks it paid", async () => {
    const stripeError = Object.assign(new Error("Your card was declined."), { code: "card_declined" });
    const deps = makeDeps({ transferOutcomes: { "batch-1": stripeError } });

    const summary = await runSettlementTransfer(deps);

    assert.equal(summary.failed.length, 1);
    assert.equal(summary.failed[0]!.failureCode, "card_declined");
    assert.deepEqual(deps.failed, ["batch-1"]);
    assert.deepEqual(deps.paid, []);
    assert.equal(deps.recorded.length, 1);
    assert.equal(deps.recorded[0]!.status, "failed");
    assert.equal(deps.recorded[0]!.attemptCount, 1);
  });

  it("a retry after a failure uses attempt number 2 in its idempotency key", async () => {
    const deps = makeDeps({ attemptCounts: { "batch-1": 1 } });

    await runSettlementTransfer(deps);

    assert.equal(deps.transferCalls[0]!.idempotencyKey, "lokala_settlement_transfer_batch-1_2");
    assert.equal(deps.recorded[0]!.attemptCount, 2);
  });
});

describe("runSettlementTransfer: partial-failure isolation across batches", () => {
  it("one batch's Stripe failure does not block or roll back another batch's success", async () => {
    const batchOk = batch({ id: "batch-ok", merchantAccountId: "merchant-ok" });
    const batchBad = batch({ id: "batch-bad", merchantAccountId: "merchant-bad" });

    const deps = makeDeps({
      batches: [batchOk, batchBad],
      transferOutcomes: {
        "batch-bad": Object.assign(new Error("insufficient funds"), { code: "balance_insufficient" }),
      },
    });

    const summary = await runSettlementTransfer(deps);

    assert.equal(summary.transferred.length, 1);
    assert.equal(summary.transferred[0]!.settlementBatchId, "batch-ok");
    assert.equal(summary.failed.length, 1);
    assert.equal(summary.failed[0]!.settlementBatchId, "batch-bad");

    assert.deepEqual(deps.paid, ["batch-ok"]);
    assert.deepEqual(deps.failed, ["batch-bad"]);
  });

  it("processes batches for different merchants independently even when one merchant has no connected account", async () => {
    const batchOk = batch({ id: "batch-ok2", merchantAccountId: "merchant-ok2" });
    const batchNoAccount = batch({ id: "batch-no-acct", merchantAccountId: "merchant-missing" });

    const deps = makeDeps({
      batches: [batchOk, batchNoAccount],
      connectedAccounts: { "merchant-ok2": "acct_ok2" },
    });

    const summary = await runSettlementTransfer(deps);

    assert.equal(summary.transferred.length, 1);
    assert.equal(summary.transferred[0]!.settlementBatchId, "batch-ok2");
    assert.equal(summary.failed.length, 1);
    assert.equal(summary.failed[0]!.settlementBatchId, "batch-no-acct");
    assert.match(summary.failed[0]!.failureMessage, /No Stripe connected account/);
  });
});

describe("runSettlementTransfer: a single-batch manual retry filters to just that batch", () => {
  it("passes the batchId through to listClaimableBatches and only touches that batch", async () => {
    const deps = makeDeps({ batches: [batch({ id: "batch-1" }), batch({ id: "batch-2" })] });

    const summary = await runSettlementTransfer(deps, { batchId: "batch-2" });

    assert.equal(summary.transferred.length, 1);
    assert.equal(summary.transferred[0]!.settlementBatchId, "batch-2");
  });
});
