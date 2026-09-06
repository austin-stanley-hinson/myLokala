/**
 * Settlement transfer execution: for each claimable settlement_batches row,
 * transfer its net_payable_cents to the merchant's Stripe connected account.
 * SERVER-ONLY, service-role only.
 *
 * "Claimable" means status IN ('pending', 'failed') -- a batch already
 * 'processing' or 'paid' is never touched again, and a 'failed' batch is
 * exactly what "re-triggerable manually" means: the next run picks it back
 * up. The claim itself is an atomic conditional UPDATE (pending/failed ->
 * processing) done BEFORE calling Stripe; if it affects no row, this batch
 * lost a race (another concurrent run already claimed it) or was never
 * actually claimable, and is skipped without calling Stripe at all. This is
 * the primary double-transfer defense -- the Stripe idempotency key below is
 * a second, independent layer for the narrower case of a network blip
 * between calling Stripe and recording the result for the SAME attempt.
 *
 * The idempotency key is deterministic per (batch, attempt number), not per
 * batch alone: stripe_transfer_attempts.idempotency_key is UNIQUE across the
 * whole table, and a genuine retry after a real failure must insert a NEW
 * row (never overwrite the failed one) -- so it needs a fresh key. Keying by
 * attempt number still makes any given attempt's own retry (e.g. this
 * process crashing between the Stripe call succeeding and the DB write)
 * safe to replay with Stripe.
 *
 * Each batch is transferred independently, in its own try/catch: one
 * batch's Stripe failure is recorded and leaves that batch 'failed' without
 * touching any other batch already marked 'paid' in this same run. There is
 * no automatic retry here -- a failed batch is left visible and waits for
 * the next manual run.
 */

export type ClaimableBatch = {
  id: string;
  merchantAccountId: string;
  netPayableCents: number;
  currency: string;
};

export type TransferOutcome =
  | { status: "transferred"; settlementBatchId: string; stripeTransferId: string; amountCents: number }
  | { status: "skipped_not_claimable"; settlementBatchId: string }
  | { status: "failed"; settlementBatchId: string; failureCode: string | null; failureMessage: string };

export type SettlementTransferDeps = {
  /** Batches with status IN ('pending', 'failed'), optionally narrowed to
   * one batch id for a manual single-batch retry. */
  listClaimableBatches: (batchId?: string) => Promise<ClaimableBatch[]>;
  /** Atomically flips status pending|failed -> processing. False means this
   * batch was not in a claimable state (already processing/paid/reversed,
   * or lost a race) -- the caller must not proceed to call Stripe. */
  claimBatchForProcessing: (batchId: string) => Promise<boolean>;
  /** True platform livemode, read once per run from platform_config (the
   * SAME source of truth batching's own readiness check reads internally --
   * never derived from the Stripe key prefix, so the two can never
   * disagree). */
  getPlatformLivemode: () => Promise<boolean>;
  getConnectedAccountId: (merchantAccountId: string, livemode: boolean) => Promise<string | null>;
  countExistingAttempts: (settlementBatchId: string) => Promise<number>;
  createTransfer: (args: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    settlementBatchId: string;
    idempotencyKey: string;
  }) => Promise<{ stripeTransferId: string }>;
  recordAttempt: (args: {
    settlementBatchId: string;
    idempotencyKey: string;
    amountCents: number;
    attemptCount: number;
    status: "succeeded" | "failed";
    stripeTransferId?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
  }) => Promise<void>;
  markBatchPaid: (batchId: string) => Promise<void>;
  markBatchFailed: (batchId: string) => Promise<void>;
};

export type SettlementTransferSummary = {
  transferred: Extract<TransferOutcome, { status: "transferred" }>[];
  skipped: Extract<TransferOutcome, { status: "skipped_not_claimable" }>[];
  failed: Extract<TransferOutcome, { status: "failed" }>[];
};

function settlementTransferIdempotencyKey(settlementBatchId: string, attemptNumber: number): string {
  return `lokala_settlement_transfer_${settlementBatchId}_${attemptNumber}`;
}

/** A Stripe error carries `code`/`message`; anything else is stringified
 * into `message` with a null code, so a non-Stripe throw still records a
 * distinct, retriable attempt rather than crashing the whole run. */
function describeTransferError(err: unknown): { code: string | null; message: string } {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : null,
      message: typeof e.message === "string" ? e.message : "Unknown Stripe error",
    };
  }
  return { code: null, message: err instanceof Error ? err.message : "Unknown error" };
}

async function transferOneBatch(
  batch: ClaimableBatch,
  livemode: boolean,
  deps: SettlementTransferDeps,
): Promise<TransferOutcome> {
  const claimed = await deps.claimBatchForProcessing(batch.id);
  if (!claimed) {
    return { status: "skipped_not_claimable", settlementBatchId: batch.id };
  }

  // Computed once, up front, and reused by both the success and failure
  // paths below -- never recomputed after a Stripe call, so a failure
  // partway through can't observe a different attempt number than the one
  // its own idempotency key was built from.
  const attemptNumber = (await deps.countExistingAttempts(batch.id)) + 1;
  const idempotencyKey = settlementTransferIdempotencyKey(batch.id, attemptNumber);

  try {
    const destinationAccountId = await deps.getConnectedAccountId(batch.merchantAccountId, livemode);
    if (!destinationAccountId) {
      throw new Error(
        `No Stripe connected account for merchant ${batch.merchantAccountId} (livemode=${livemode})`,
      );
    }

    const { stripeTransferId } = await deps.createTransfer({
      amountCents: batch.netPayableCents,
      currency: batch.currency,
      destinationAccountId,
      settlementBatchId: batch.id,
      idempotencyKey,
    });

    await deps.recordAttempt({
      settlementBatchId: batch.id,
      idempotencyKey,
      amountCents: batch.netPayableCents,
      attemptCount: attemptNumber,
      status: "succeeded",
      stripeTransferId,
    });
    await deps.markBatchPaid(batch.id);

    return {
      status: "transferred",
      settlementBatchId: batch.id,
      stripeTransferId,
      amountCents: batch.netPayableCents,
    };
  } catch (err) {
    const { code, message } = describeTransferError(err);
    try {
      await deps.recordAttempt({
        settlementBatchId: batch.id,
        idempotencyKey,
        amountCents: batch.netPayableCents,
        attemptCount: attemptNumber,
        status: "failed",
        failureCode: code,
        failureMessage: message,
      });
    } catch (recordErr) {
      // The attempt itself already failed; a failure to even RECORD that
      // must not be swallowed silently, but also must not stop the batch
      // status update below from happening.
      console.error("[settlement-transfer] record_attempt_failed", recordErr);
    }
    await deps.markBatchFailed(batch.id);

    return { status: "failed", settlementBatchId: batch.id, failureCode: code, failureMessage: message };
  }
}

export async function runSettlementTransfer(
  deps: SettlementTransferDeps,
  options: { batchId?: string } = {},
): Promise<SettlementTransferSummary> {
  const summary: SettlementTransferSummary = { transferred: [], skipped: [], failed: [] };

  const batches = await deps.listClaimableBatches(options.batchId);
  if (batches.length === 0) {
    return summary;
  }

  const livemode = await deps.getPlatformLivemode();

  for (const batch of batches) {
    const outcome = await transferOneBatch(batch, livemode, deps);
    if (outcome.status === "transferred") summary.transferred.push(outcome);
    else if (outcome.status === "skipped_not_claimable") summary.skipped.push(outcome);
    else summary.failed.push(outcome);
  }

  return summary;
}
