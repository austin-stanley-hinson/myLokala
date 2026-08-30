/**
 * Stripe Connect webhook handler. SERVER-ONLY.
 *
 * Uses public.service_claim_stripe_webhook_event /
 * public.service_complete_stripe_webhook_event — wrappers that match the
 * existing app_private function signatures. Do not use the mismatched
 * PaymentIntent claim helper (wrong args, wrong return shape, public table).
 */

import type Stripe from "stripe";

import {
  connectJson,
  logConnectFailure,
  type ConnectAdminRpc,
} from "./connect-onboarding.ts";
import { readinessPatchFromStripeAccount } from "./connect-readiness.ts";

export const CONNECT_WEBHOOK_LEASE_SECONDS = 300;

type ClaimRow = {
  event_id?: string;
  claim_status?: string;
  attempt_count?: number;
};

export type ConnectWebhookStripe = {
  webhooks: {
    constructEvent: (
      payload: string,
      header: string,
      secret: string,
    ) => Stripe.Event;
  };
};

function ack(detail: string): Response {
  return connectJson({ received: true, detail }, 200);
}

function retryLater(detail: string): Response {
  return connectJson({ error: detail }, 500);
}

function asClaimRow(data: unknown): ClaimRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? (row as ClaimRow) : null;
}

function objectIdFromEvent(event: Stripe.Event): string | null {
  const object = event.data.object as { id?: unknown };
  return typeof object?.id === "string" ? object.id : null;
}

async function completeClaim(
  admin: ConnectAdminRpc,
  stripeEventId: string,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  const { error } = await admin.rpc("service_complete_stripe_webhook_event", {
    p_stripe_event_id: stripeEventId,
    p_success: success,
    p_error: success ? null : (errorMessage ?? "processing_failed").slice(0, 500),
  });
  if (error) {
    throw error;
  }
}

export async function claimConnectWebhookEvent(
  admin: ConnectAdminRpc,
  params: {
    stripeEventId: string;
    eventType: string;
    objectId: string | null;
    livemode: boolean;
    leaseSeconds?: number;
  },
): Promise<{ status: string; attemptCount: number }> {
  const { data, error } = await admin.rpc("service_claim_stripe_webhook_event", {
    p_stripe_event_id: params.stripeEventId,
    p_event_type: params.eventType,
    p_object_id: params.objectId,
    p_livemode: params.livemode,
    p_lease_seconds: params.leaseSeconds ?? CONNECT_WEBHOOK_LEASE_SECONDS,
  });
  if (error) {
    throw error;
  }
  const row = asClaimRow(data);
  if (!row?.claim_status) {
    throw new Error("claim returned no status");
  }
  return {
    status: row.claim_status,
    attemptCount: row.attempt_count ?? 0,
  };
}

async function syncAccountUpdated(
  admin: ConnectAdminRpc,
  event: Stripe.Event,
): Promise<"matched" | "unknown"> {
  if (event.data.object.object !== "account") {
    return "unknown";
  }
  const account = event.data.object as Stripe.Account;
  const patch = readinessPatchFromStripeAccount(account, event.livemode);
  const { data, error } = await admin.rpc("service_sync_stripe_connected_account", {
    p_stripe_account_id: account.id,
    p_livemode: event.livemode,
    p_onboarding_status: patch.onboarding_status,
    p_charges_enabled: patch.charges_enabled,
    p_payouts_enabled: patch.payouts_enabled,
    p_transfers_enabled: patch.transfers_enabled,
    p_details_submitted: patch.details_submitted,
    p_disabled_reason: patch.disabled_reason,
    p_requirements_currently_due: patch.requirements_currently_due,
    p_requirements_past_due: patch.requirements_past_due,
    p_requirements_eventually_due: patch.requirements_eventually_due,
    p_last_stripe_event_at: new Date(event.created * 1000).toISOString(),
  });
  if (error) {
    throw error;
  }
  const matched =
    data && typeof data === "object" && !Array.isArray(data)
      ? Boolean((data as { matched?: unknown }).matched)
      : false;
  return matched ? "matched" : "unknown";
}

export async function handleConnectWebhook(input: {
  stripe: ConnectWebhookStripe;
  admin: ConnectAdminRpc;
  rawBody: string;
  signature: string | null;
  secret: string | undefined;
}): Promise<Response> {
  if (!input.secret) {
    logConnectFailure("connect.webhook", "missing_webhook_secret");
    return retryLater("not configured");
  }
  if (!input.signature) {
    logConnectFailure("connect.webhook", "missing_signature");
    return new Response("missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = input.stripe.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      input.secret,
    );
  } catch {
    logConnectFailure("connect.webhook", "invalid_signature");
    return new Response("invalid signature", { status: 400 });
  }

  let claim: { status: string; attemptCount: number };
  try {
    claim = await claimConnectWebhookEvent(input.admin, {
      stripeEventId: event.id,
      eventType: event.type,
      objectId: objectIdFromEvent(event),
      livemode: event.livemode,
    });
  } catch (err) {
    logConnectFailure("connect.webhook", "claim_failed", err);
    return retryLater("could not claim event");
  }

  if (claim.status === "already_completed") {
    return ack("already processed");
  }
  if (claim.status === "in_progress") {
    return retryLater("already in progress");
  }
  if (claim.status !== "claimed") {
    logConnectFailure("connect.webhook", "unexpected_claim_status");
    return retryLater("could not claim event");
  }

  try {
    if (event.type !== "account.updated") {
      await completeClaim(input.admin, event.id, true);
      return ack("event type not handled");
    }

    const result = await syncAccountUpdated(input.admin, event);
    await completeClaim(input.admin, event.id, true);
    if (result === "unknown") {
      return ack("account not tracked");
    }
    return ack("account readiness updated");
  } catch (err) {
    logConnectFailure("connect.webhook", "handler_failed", err);
    try {
      await completeClaim(input.admin, event.id, false, "processing_failed");
    } catch (completeError) {
      logConnectFailure("connect.webhook", "complete_failed", completeError);
    }
    return retryLater("processing failed");
  }
}
