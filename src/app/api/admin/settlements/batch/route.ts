import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedSettlementAdminRequest } from "@/lib/settlement/adminAuth";
import {
  runSettlementBatching,
  type PendingSettlementMerchant,
  type SettlementBatchingDeps,
} from "@/lib/settlement/batch";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/settlements/batch — manually-triggered settlement
 * batching. Not a cron job (a later, separate decision); not open to any
 * authenticated user (see adminAuth.ts). Batches every Connect-ready
 * merchant's not-yet-batched completed redemptions into one
 * settlement_batches row each; a merchant that isn't ready is reported
 * distinctly, never silently skipped from the response.
 *
 * Does not call Stripe. See /api/admin/settlements/transfer for the second,
 * separate step that actually moves money.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

function logSettlementFailure(code: string, detail?: unknown): void {
  console.error(`[settlement-batch] ${code}`, detail ?? "");
}

function buildDeps(admin: ReturnType<typeof createAdminClient>): SettlementBatchingDeps {
  return {
    async listPendingMerchants(): Promise<PendingSettlementMerchant[]> {
      const { data, error } = await admin.rpc("service_list_merchants_pending_settlement");
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      return rows.map((row) => ({
        merchantAccountId: String((row as { merchant_account_id: unknown }).merchant_account_id),
        pendingRedemptionCount: Number(
          (row as { pending_redemption_count: unknown }).pending_redemption_count,
        ),
      }));
    },
    async batchMerchant(merchantAccountId: string): Promise<unknown> {
      const { data, error } = await admin.rpc("service_batch_merchant_settlement", {
        p_merchant_account_id: merchantAccountId,
      });
      if (error) throw error;
      return data;
    },
  };
}

export async function POST(req: Request) {
  if (!isAuthorizedSettlementAdminRequest(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createAdminClient();

  try {
    const summary = await runSettlementBatching(buildDeps(admin));

    if (summary.errors.length > 0) {
      logSettlementFailure("merchant_batching_errors", summary.errors);
    }

    return json(summary, 200);
  } catch (err) {
    logSettlementFailure("run_failed", err);
    return json({ error: "Settlement batching failed. See server logs." }, 500);
  }
}
