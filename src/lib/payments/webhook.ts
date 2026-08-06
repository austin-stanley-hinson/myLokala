import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentStatus } from "@/lib/payments/create-payment";

/**
 * Ledger state machine applied by the Stripe webhook. SERVER-ONLY.
 *
 * Transitions are monotonic: a terminal status is never left, so a duplicate or
 * out-of-order delivery cannot regress a settled payment. The same rule is
 * enforced by a BEFORE UPDATE trigger in the database, so this is defense in
 * depth rather than the only guard.
 */

const ADVANCEABLE: readonly PaymentStatus[] = ["pending", "processing"];

export type HandledEvent = {
  status: PaymentStatus;
  failureCode?: string | null;
};

/** Map a Stripe event type to the ledger status it implies, or null to ignore. */
export function statusForEventType(eventType: string): PaymentStatus | null {
  switch (eventType) {
    case "payment_intent.succeeded":
      return "succeeded";
    case "payment_intent.processing":
      return "processing";
    case "payment_intent.payment_failed":
      return "failed";
    case "payment_intent.canceled":
      return "canceled";
    default:
      return null;
  }
}

/**
 * Column patch for a status transition. Timestamps are set on the transition
 * that earns them so reconciliation and receipts do not have to infer them.
 */
export function patchForStatus(
  status: PaymentStatus,
  intent: Stripe.PaymentIntent,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, livemode: intent.livemode };

  if (status === "succeeded") {
    patch.succeeded_at = now;
    patch.failure_code = null;
  }
  if (status === "failed") {
    patch.failed_at = now;
    // Stripe's machine-readable code only. The raw message stays in our logs so
    // nothing quotable to a customer can leak through the API.
    patch.failure_code = intent.last_payment_error?.code ?? "payment_failed";
  }
  if (status === "canceled") {
    patch.canceled_at = now;
    patch.failure_code = intent.cancellation_reason ?? null;
  }

  return patch;
}

/**
 * Advance a transaction, refusing to touch rows that are already terminal.
 * Returns the row id when the transition was applied, or null when it was a
 * no-op (already settled, or already in that state).
 */
export async function advanceTransaction(
  admin: SupabaseClient,
  transactionId: string,
  patch: Record<string, unknown>,
): Promise<{ applied: boolean; error: unknown | null }> {
  const { data, error } = await admin
    .from("payment_transactions")
    .update(patch)
    .eq("id", transactionId)
    .in("status", ADVANCEABLE as unknown as string[])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return { applied: false, error };
  }
  return { applied: Boolean(data?.id), error: null };
}

/**
 * Resolve the ledger row for an event. Prefers the transaction id we wrote into
 * Stripe metadata at creation, falling back to the PaymentIntent id so intents
 * created before metadata existed can still be matched.
 */
export async function findTransactionForIntent(
  admin: SupabaseClient,
  intent: Stripe.PaymentIntent,
): Promise<{ id: string; kind: string; status: PaymentStatus } | null> {
  const metadataId = intent.metadata?.payment_transaction_id;

  if (metadataId) {
    const { data } = await admin
      .from("payment_transactions")
      .select("id, kind, status")
      .eq("id", metadataId)
      .maybeSingle<{ id: string; kind: string; status: PaymentStatus }>();
    if (data) return data;
  }

  const { data } = await admin
    .from("payment_transactions")
    .select("id, kind, status")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle<{ id: string; kind: string; status: PaymentStatus }>();

  return data ?? null;
}

/**
 * Stripe's actual processing cost, known only after the charge settles. Read
 * from the platform balance transaction. Returns null when it is not yet
 * available -- that is normal and must not fail the webhook.
 */
export async function resolveSettlement(
  stripe: Stripe,
  intent: Stripe.PaymentIntent,
): Promise<{ chargeId: string | null; stripeFeeCents: number | null }> {
  const chargeId =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : (intent.latest_charge?.id ?? null);

  if (!chargeId) {
    return { chargeId: null, stripeFeeCents: null };
  }

  try {
    const charge = await stripe.charges.retrieve(chargeId, {
      expand: ["balance_transaction"],
    });
    const balanceTransaction = charge.balance_transaction;
    const stripeFeeCents =
      balanceTransaction && typeof balanceTransaction !== "string"
        ? balanceTransaction.fee
        : null;
    return { chargeId, stripeFeeCents };
  } catch {
    // Fee reporting is best-effort; never let it block the status transition.
    return { chargeId, stripeFeeCents: null };
  }
}
