/**
 * Connect webhook unit tests. Mocked Stripe + claim RPCs only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";

import type { ConnectAdminRpc } from "./connect-onboarding.ts";
import { handleConnectWebhook, type ConnectWebhookStripe } from "./connect-webhook.ts";

type RpcCall = { fn: string; args?: Record<string, unknown> };

function jsonRpc(
  handlers: Record<string, (args?: Record<string, unknown>) => unknown>,
): { admin: ConnectAdminRpc; calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  const admin: ConnectAdminRpc = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      if (!(fn in handlers)) {
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
      }
      try {
        return { data: handlers[fn](args), error: null };
      } catch (err) {
        return {
          data: null,
          error: { message: err instanceof Error ? err.message : "rpc failed" },
        };
      }
    },
  };
  return { admin, calls };
}

function accountUpdatedEvent(overrides?: Partial<Stripe.Account>): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    api_version: null,
    created: 1_700_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "account.updated",
    data: {
      object: {
        id: "acct_tracked",
        object: "account",
        charges_enabled: false,
        payouts_enabled: true,
        details_submitted: true,
        capabilities: { transfers: "active" },
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: null,
        },
        ...overrides,
      } as Stripe.Account,
    },
  } as Stripe.Event;
}

function mockStripe(eventFactory: () => Stripe.Event): ConnectWebhookStripe {
  return {
    webhooks: {
      constructEvent(payload, header, secret) {
        if (header !== "valid-sig" || secret !== "whsec_test") {
          throw new Error("Invalid signature");
        }
        void payload;
        return eventFactory();
      },
    },
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("handleConnectWebhook", () => {
  it("rejects an invalid signature with 400", async () => {
    const { admin } = jsonRpc({});
    const response = await handleConnectWebhook({
      stripe: mockStripe(accountUpdatedEvent),
      admin,
      rawBody: "{}",
      signature: "bad-sig",
      secret: "whsec_test",
    });
    assert.equal(response.status, 400);
  });

  it("acknowledges a duplicate already-completed claim", async () => {
    const { admin, calls } = jsonRpc({
      service_claim_stripe_webhook_event: () => [
        { event_id: "e1", claim_status: "already_completed", attempt_count: 2 },
      ],
    });
    const response = await handleConnectWebhook({
      stripe: mockStripe(accountUpdatedEvent),
      admin,
      rawBody: "{}",
      signature: "valid-sig",
      secret: "whsec_test",
    });
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.received, true);
    assert.equal(
      calls.some((call) => call.fn === "service_sync_stripe_connected_account"),
      false,
    );
  });

  it("acknowledges an unknown connected account without inserting", async () => {
    const { admin, calls } = jsonRpc({
      service_claim_stripe_webhook_event: () => [
        { event_id: "e1", claim_status: "claimed", attempt_count: 1 },
      ],
      service_sync_stripe_connected_account: () => ({ matched: false }),
      service_complete_stripe_webhook_event: () => null,
    });
    const response = await handleConnectWebhook({
      stripe: mockStripe(() =>
        accountUpdatedEvent({ id: "acct_unknown" } as Partial<Stripe.Account>),
      ),
      admin,
      rawBody: "{}",
      signature: "valid-sig",
      secret: "whsec_test",
    });
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.detail, "account not tracked");
    const sync = calls.find(
      (call) => call.fn === "service_sync_stripe_connected_account",
    );
    assert.equal(sync?.args?.p_stripe_account_id, "acct_unknown");
    assert.equal(
      calls.some((call) => call.fn === "service_complete_stripe_webhook_event"),
      true,
    );
  });

  it("maps account.updated onto transfers-first readiness", async () => {
    const { admin, calls } = jsonRpc({
      service_claim_stripe_webhook_event: () => [
        { event_id: "e1", claim_status: "claimed", attempt_count: 1 },
      ],
      service_sync_stripe_connected_account: () => ({ matched: true }),
      service_complete_stripe_webhook_event: () => null,
    });
    const response = await handleConnectWebhook({
      stripe: mockStripe(accountUpdatedEvent),
      admin,
      rawBody: "{}",
      signature: "valid-sig",
      secret: "whsec_test",
    });
    assert.equal(response.status, 200);
    const sync = calls.find(
      (call) => call.fn === "service_sync_stripe_connected_account",
    );
    assert.equal(sync?.args?.p_onboarding_status, "complete");
    assert.equal(sync?.args?.p_transfers_enabled, true);
    assert.equal(sync?.args?.p_charges_enabled, false);
    assert.equal(sync?.args?.p_livemode, false);
  });

  it("fails the claim and returns 500 so Stripe can retry", async () => {
    const { admin, calls } = jsonRpc({
      service_claim_stripe_webhook_event: () => [
        { event_id: "e1", claim_status: "claimed", attempt_count: 1 },
      ],
      service_sync_stripe_connected_account: () => {
        throw new Error("db down");
      },
      service_complete_stripe_webhook_event: () => null,
    });
    const response = await handleConnectWebhook({
      stripe: mockStripe(accountUpdatedEvent),
      admin,
      rawBody: "{}",
      signature: "valid-sig",
      secret: "whsec_test",
    });
    assert.equal(response.status, 500);
    const complete = calls.find(
      (call) => call.fn === "service_complete_stripe_webhook_event",
    );
    assert.equal(complete?.args?.p_success, false);
  });

  it("returns 500 when another worker holds the claim lease", async () => {
    const { admin } = jsonRpc({
      service_claim_stripe_webhook_event: () => [
        { event_id: "e1", claim_status: "in_progress", attempt_count: 1 },
      ],
    });
    const response = await handleConnectWebhook({
      stripe: mockStripe(accountUpdatedEvent),
      admin,
      rawBody: "{}",
      signature: "valid-sig",
      secret: "whsec_test",
    });
    assert.equal(response.status, 500);
  });

  it("acknowledges unrelated events after completing the claim", async () => {
    const { admin, calls } = jsonRpc({
      service_claim_stripe_webhook_event: () => [
        { event_id: "e2", claim_status: "claimed", attempt_count: 1 },
      ],
      service_complete_stripe_webhook_event: () => null,
    });
    const response = await handleConnectWebhook({
      stripe: {
        webhooks: {
          constructEvent: () =>
            ({
              ...accountUpdatedEvent(),
              id: "evt_other",
              type: "capability.updated",
            }) as Stripe.Event,
        },
      },
      admin,
      rawBody: "{}",
      signature: "valid-sig",
      secret: "whsec_test",
    });
    assert.equal(response.status, 200);
    assert.equal(
      calls.some((call) => call.fn === "service_sync_stripe_connected_account"),
      false,
    );
    assert.equal(
      calls.some((call) => call.fn === "service_complete_stripe_webhook_event"),
      true,
    );
  });

  it("does not include Stripe account ids in the JSON body", async () => {
    const { admin } = jsonRpc({
      service_claim_stripe_webhook_event: () => [
        { event_id: "e1", claim_status: "claimed", attempt_count: 1 },
      ],
      service_sync_stripe_connected_account: () => ({ matched: true }),
      service_complete_stripe_webhook_event: () => null,
    });
    const response = await handleConnectWebhook({
      stripe: mockStripe(accountUpdatedEvent),
      admin,
      rawBody: "{}",
      signature: "valid-sig",
      secret: "whsec_test",
    });
    const text = await response.text();
    assert.equal(/acct_/.test(text), false);
    assert.equal(/whsec_/.test(text), false);
  });
});
