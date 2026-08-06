import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Atomic claim results for stripe_webhook_events.
 *
 * claimed            — this worker owns processing (first delivery or retry)
 * already_processed  — processed_at is set; ack 200, do not re-run handlers
 * in_progress        — another worker holds a fresh lease; return 500 so Stripe
 *                      retries later without double-executing handlers
 */
export type WebhookClaimResult =
  | { status: "claimed"; attemptCount: number }
  | { status: "already_processed"; attemptCount: number }
  | { status: "in_progress"; attemptCount: number };

type ClaimRpcRow = {
  claimed: boolean;
  already_processed: boolean;
  attempt_count: number;
};

/** Default lease: if a worker dies mid-handler, another delivery may reclaim. */
export const WEBHOOK_CLAIM_LEASE_SECONDS = 120;

/**
 * Atomically claim a Stripe webhook event for processing.
 * Implemented by public.claim_stripe_webhook_event (SECURITY DEFINER).
 */
export async function claimStripeWebhookEvent(
  admin: SupabaseClient,
  params: {
    stripeEventId: string;
    eventType: string;
    livemode: boolean;
    leaseSeconds?: number;
  },
): Promise<WebhookClaimResult> {
  const { data, error } = await admin.rpc("claim_stripe_webhook_event", {
    p_stripe_event_id: params.stripeEventId,
    p_event_type: params.eventType,
    p_livemode: params.livemode,
    p_lease_seconds: params.leaseSeconds ?? WEBHOOK_CLAIM_LEASE_SECONDS,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data)
    ? (data[0] as ClaimRpcRow | undefined)
    : (data as ClaimRpcRow | null | undefined);

  if (!row) {
    throw new Error("claim_stripe_webhook_event returned no row");
  }

  if (row.claimed) {
    return { status: "claimed", attemptCount: row.attempt_count };
  }
  if (row.already_processed) {
    return { status: "already_processed", attemptCount: row.attempt_count };
  }
  return { status: "in_progress", attemptCount: row.attempt_count };
}

/**
 * Mark the event fully completed. Retries of this event id will ack as done.
 */
export async function markWebhookEventProcessed(
  admin: SupabaseClient,
  stripeEventId: string,
  patch: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin
    .from("stripe_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      locked_at: null,
      process_error: null,
      ...patch,
    })
    .eq("stripe_event_id", stripeEventId)
    .is("processed_at", null);

  if (error) {
    throw error;
  }
}

/**
 * Release the processing lease after a transient failure so Stripe's next
 * delivery (same event id) can reclaim and re-run the handler. History row
 * is kept; processed_at stays null.
 */
export async function releaseWebhookEventClaim(
  admin: SupabaseClient,
  stripeEventId: string,
  processError: string,
): Promise<void> {
  const { error } = await admin
    .from("stripe_webhook_events")
    .update({
      locked_at: null,
      process_error: processError.slice(0, 500),
    })
    .eq("stripe_event_id", stripeEventId)
    .is("processed_at", null);

  if (error) {
    throw error;
  }
}
