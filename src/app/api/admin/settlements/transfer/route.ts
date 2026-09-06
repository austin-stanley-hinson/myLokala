import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { isAuthorizedSettlementAdminRequest } from "@/lib/settlement/adminAuth";
import {
  readConnectedAccountId,
  readPlatformStripeLivemode,
} from "@/lib/stripe/connect-onboarding";
import {
  runSettlementTransfer,
  type ClaimableBatch,
  type SettlementTransferDeps,
} from "@/lib/settlement/transfer";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/settlements/transfer — manually-triggered settlement
 * transfer execution. Not a cron job; not open to any authenticated user
 * (see adminAuth.ts). Transfers every claimable settlement_batches row
 * (status pending or failed) to its merchant's Stripe connected account, one
 * batch at a time, each independently -- see transfer.ts's module docstring
 * for the idempotency and partial-failure-isolation discipline.
 *
 * Optional JSON body `{ "settlementBatchId": "<uuid>" }` narrows this run to
 * one specific batch -- the manual re-trigger path for a batch that
 * previously failed.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

function logSettlementFailure(code: string, detail?: unknown): void {
  console.error(`[settlement-transfer] ${code}`, detail ?? "");
}

const CLAIMABLE_STATUSES = ["pending", "failed"];

function buildDeps(admin: ReturnType<typeof createAdminClient>): SettlementTransferDeps {
  const stripe = getStripe();

  return {
    async listClaimableBatches(batchId?: string): Promise<ClaimableBatch[]> {
      let query = admin
        .from("settlement_batches")
        .select("id, merchant_account_id, net_payable_cents, currency")
        .in("status", CLAIMABLE_STATUSES);
      if (batchId) query = query.eq("id", batchId);

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: String(row.id),
        merchantAccountId: String(row.merchant_account_id),
        netPayableCents: Number(row.net_payable_cents),
        currency: String(row.currency),
      }));
    },

    async claimBatchForProcessing(batchId: string): Promise<boolean> {
      const { data, error } = await admin
        .from("settlement_batches")
        .update({ status: "processing" })
        .eq("id", batchId)
        .in("status", CLAIMABLE_STATUSES)
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    getPlatformLivemode: () => readPlatformStripeLivemode(admin),

    getConnectedAccountId: (merchantAccountId, livemode) =>
      readConnectedAccountId(admin, merchantAccountId, livemode),

    async countExistingAttempts(settlementBatchId: string): Promise<number> {
      const { data, error } = await admin.rpc("service_count_stripe_transfer_attempts", {
        p_settlement_batch_id: settlementBatchId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async createTransfer({ amountCents, currency, destinationAccountId, settlementBatchId, idempotencyKey }) {
      const transfer = await stripe.transfers.create(
        {
          amount: amountCents,
          currency: currency.toLowerCase(),
          destination: destinationAccountId,
          transfer_group: settlementBatchId,
          metadata: { settlement_batch_id: settlementBatchId },
        },
        { idempotencyKey },
      );
      return { stripeTransferId: transfer.id };
    },

    async recordAttempt({
      settlementBatchId,
      idempotencyKey,
      amountCents,
      attemptCount,
      status,
      stripeTransferId,
      failureCode,
      failureMessage,
    }) {
      const { error } = await admin.rpc("service_record_stripe_transfer_attempt", {
        p_settlement_batch_id: settlementBatchId,
        p_idempotency_key: idempotencyKey,
        p_amount_cents: amountCents,
        p_status: status,
        p_attempt_count: attemptCount,
        p_stripe_transfer_id: stripeTransferId ?? null,
        p_failure_code: failureCode ?? null,
        p_failure_message: failureMessage ?? null,
      });
      if (error) throw error;
    },

    async markBatchPaid(batchId: string): Promise<void> {
      const { error } = await admin
        .from("settlement_batches")
        .update({ status: "paid" })
        .eq("id", batchId)
        .eq("status", "processing");
      if (error) throw error;
    },

    async markBatchFailed(batchId: string): Promise<void> {
      const { error } = await admin
        .from("settlement_batches")
        .update({ status: "failed" })
        .eq("id", batchId)
        .eq("status", "processing");
      if (error) throw error;
    },
  };
}

export async function POST(req: Request) {
  if (!isAuthorizedSettlementAdminRequest(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let batchId: string | undefined;
  try {
    const rawBody = await req.text();
    if (rawBody) {
      const body = JSON.parse(rawBody) as { settlementBatchId?: unknown };
      if (typeof body.settlementBatchId === "string" && body.settlementBatchId.length > 0) {
        batchId = body.settlementBatchId;
      }
    }
  } catch (err) {
    logSettlementFailure("invalid_body", err);
    return json({ error: "Invalid request body." }, 400);
  }

  const admin = createAdminClient();

  try {
    const summary = await runSettlementTransfer(buildDeps(admin), { batchId });

    if (summary.failed.length > 0) {
      logSettlementFailure("transfer_failures", summary.failed);
    }

    return json(summary, 200);
  } catch (err) {
    logSettlementFailure("run_failed", err);
    return json({ error: "Settlement transfer run failed. See server logs." }, 500);
  }
}
