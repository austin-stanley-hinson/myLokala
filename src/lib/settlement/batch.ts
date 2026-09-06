/**
 * Settlement batching: group each Connect-ready merchant's not-yet-batched
 * completed redemptions into one settlement_batches row (+ one
 * settlement_items row per redemption). SERVER-ONLY, service-role only.
 *
 * All the actual atomicity, the Connect-readiness re-check, and the fee
 * math (read from balance_redemptions, never recomputed) live in Postgres
 * (app_private.batch_merchant_settlement, migration 20260901000020) --
 * this module is a thin orchestrator that loops over pending merchants and
 * calls that RPC once per merchant.
 *
 * That loop -- not a single all-merchants SQL function -- is what gives
 * partial-failure isolation: each merchant's call is its own admin.rpc()
 * round trip, so a thrown error for one merchant (caught here, recorded in
 * `errors`, never rethrown) cannot roll back or block another merchant's
 * already-committed batch. A merchant that isn't Connect-ready is reported
 * in `notReady`, never silently absent from the summary -- its redemptions
 * stay unbatched and eligible again on the next run once it is ready.
 */

export type BatchedMerchant = {
  status: "batched";
  merchantAccountId: string;
  settlementBatchId: string;
  redemptionCount: number;
  grossSubtotalCents: number;
  tipsCents: number;
  merchantFeesCents: number;
  netPayableCents: number;
  currency: string;
};

export type NotReadyMerchant = { status: "not_ready"; merchantAccountId: string };
export type NothingToSettleMerchant = { status: "nothing_to_settle"; merchantAccountId: string };
export type BatchingErrorMerchant = { status: "error"; merchantAccountId: string; message: string };

export type BatchMerchantOutcome =
  | BatchedMerchant
  | NotReadyMerchant
  | NothingToSettleMerchant;

export type PendingSettlementMerchant = {
  merchantAccountId: string;
  pendingRedemptionCount: number;
};

export type SettlementBatchingDeps = {
  listPendingMerchants: () => Promise<PendingSettlementMerchant[]>;
  /** Calls service_batch_merchant_settlement for one merchant; returns its
   * raw jsonb result, parsed and validated by this module. */
  batchMerchant: (merchantAccountId: string) => Promise<unknown>;
};

export type SettlementBatchingSummary = {
  batched: BatchedMerchant[];
  notReady: NotReadyMerchant[];
  nothingToSettle: NothingToSettleMerchant[];
  errors: BatchingErrorMerchant[];
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Validates the RPC's jsonb response shape rather than trusting it blindly
 * -- a malformed/unexpected response is treated as an error for that
 * merchant, not a crash of the whole batching run. */
export function parseBatchMerchantResult(
  raw: unknown,
  merchantAccountId: string,
): BatchMerchantOutcome {
  if (!raw || typeof raw !== "object") {
    throw new Error(`service_batch_merchant_settlement returned an unexpected shape`);
  }
  const record = raw as Record<string, unknown>;
  const status = record.status;

  if (status === "not_ready") {
    return { status: "not_ready", merchantAccountId };
  }
  if (status === "nothing_to_settle") {
    return { status: "nothing_to_settle", merchantAccountId };
  }
  if (status === "batched") {
    const settlementBatchId = asString(record.settlement_batch_id);
    const redemptionCount = asNumber(record.redemption_count);
    const grossSubtotalCents = asNumber(record.gross_subtotal_cents);
    const tipsCents = asNumber(record.tips_cents);
    const merchantFeesCents = asNumber(record.merchant_fees_cents);
    const netPayableCents = asNumber(record.net_payable_cents);
    const currency = asString(record.currency);
    if (
      !settlementBatchId ||
      redemptionCount === null ||
      grossSubtotalCents === null ||
      tipsCents === null ||
      merchantFeesCents === null ||
      netPayableCents === null ||
      !currency
    ) {
      throw new Error("service_batch_merchant_settlement returned an incomplete 'batched' result");
    }
    return {
      status: "batched",
      merchantAccountId,
      settlementBatchId,
      redemptionCount,
      grossSubtotalCents,
      tipsCents,
      merchantFeesCents,
      netPayableCents,
      currency,
    };
  }

  throw new Error(`service_batch_merchant_settlement returned an unrecognized status: ${String(status)}`);
}

export async function runSettlementBatching(
  deps: SettlementBatchingDeps,
): Promise<SettlementBatchingSummary> {
  const summary: SettlementBatchingSummary = {
    batched: [],
    notReady: [],
    nothingToSettle: [],
    errors: [],
  };

  const pending = await deps.listPendingMerchants();

  for (const merchant of pending) {
    try {
      const raw = await deps.batchMerchant(merchant.merchantAccountId);
      const outcome = parseBatchMerchantResult(raw, merchant.merchantAccountId);
      if (outcome.status === "batched") summary.batched.push(outcome);
      else if (outcome.status === "not_ready") summary.notReady.push(outcome);
      else summary.nothingToSettle.push(outcome);
    } catch (err) {
      summary.errors.push({
        status: "error",
        merchantAccountId: merchant.merchantAccountId,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return summary;
}
