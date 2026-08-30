/**
 * Connect onboarding / login-link unit tests. Mocked Stripe only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizeConnectMutation,
  buildExpressAccountCreateParams,
  CONNECT_CLIENT_ERRORS,
  connectJson,
  createExpressLoginLink,
  isTransfersOnlyRejected,
  parseReservation,
  payloadHasForbiddenFields,
  sanitizeConnectError,
  startConnectOnboarding,
  syncConnectedAccountFromStripe,
  type ConnectAdminRpc,
  type ConnectOnboardingStripe,
} from "./connect-onboarding.ts";

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

function mockStripe(options?: {
  create?: ConnectOnboardingStripe["accounts"]["create"];
  retrieve?: ConnectOnboardingStripe["accounts"]["retrieve"];
  createLoginLink?: ConnectOnboardingStripe["accounts"]["createLoginLink"];
  accountLink?: ConnectOnboardingStripe["accountLinks"]["create"];
}): {
  stripe: ConnectOnboardingStripe;
  creates: { params: unknown; options: unknown }[];
  loginLinks: string[];
} {
  const creates: { params: unknown; options: unknown }[] = [];
  const loginLinks: string[] = [];
  const stripe: ConnectOnboardingStripe = {
    accounts: {
      create: async (params, requestOptions) => {
        creates.push({ params, options: requestOptions });
        if (options?.create) return options.create(params, requestOptions);
        return {
          id: "acct_mock_1",
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          capabilities: { transfers: "pending" },
          requirements: { currently_due: [], past_due: [], eventually_due: [] },
        };
      },
      retrieve: async (id) => {
        if (options?.retrieve) return options.retrieve(id);
        return {
          id,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: true,
          capabilities: { transfers: "pending" },
          requirements: {
            currently_due: ["external_account"],
            past_due: [],
            eventually_due: [],
          },
        };
      },
      createLoginLink: async (id) => {
        loginLinks.push(id);
        if (options?.createLoginLink) return options.createLoginLink(id);
        return { url: "https://connect.stripe.com/express/login/mock" };
      },
    },
    accountLinks: {
      create: async (params) => {
        if (options?.accountLink) return options.accountLink(params);
        return { url: "https://connect.stripe.com/setup/s/mock" };
      },
    },
  };
  return { stripe, creates, loginLinks };
}

const merchant = {
  id: "11111111-1111-1111-1111-111111111111",
  display_name: "Connect Cafe",
  support_email: "cafe@example.test",
  website_url: "https://cafe.example.test",
};

describe("authorizeConnectMutation", () => {
  it("allows owner and admin", () => {
    assert.equal(authorizeConnectMutation("u1", "owner").ok, true);
    assert.equal(authorizeConnectMutation("u1", "admin").ok, true);
  });

  it("denies staff and anonymous", () => {
    const staff = authorizeConnectMutation("u1", "staff");
    assert.equal(staff.ok, false);
    if (!staff.ok) {
      assert.equal(staff.status, 403);
      assert.equal(staff.error, CONNECT_CLIENT_ERRORS.staffDenied);
    }
    const anon = authorizeConnectMutation(null, "owner");
    assert.equal(anon.ok, false);
    if (!anon.ok) assert.equal(anon.status, 401);
  });
});

describe("buildExpressAccountCreateParams", () => {
  it("requests only transfers and never card_payments", () => {
    const params = buildExpressAccountCreateParams({
      merchantAccountId: merchant.id,
      livemode: false,
      displayName: merchant.display_name,
      supportEmail: merchant.support_email,
      websiteUrl: merchant.website_url,
      userEmail: "owner@example.test",
    });
    assert.equal(params.type, "express");
    assert.deepEqual(params.capabilities, { transfers: { requested: true } });
    assert.equal(
      params.capabilities && "card_payments" in params.capabilities,
      false,
    );
    const metadata =
      params.metadata && typeof params.metadata === "object"
        ? params.metadata
        : {};
    assert.equal(metadata.lokala_merchant_account_id, merchant.id);
    assert.equal(metadata.lokala_livemode, "false");
    assert.equal(params.email, "cafe@example.test");
  });
});

describe("parseReservation", () => {
  it("reuses a stored idempotency key", async () => {
    const { admin } = jsonRpc({
      service_reserve_stripe_connect_account: () => ({
        outcome: "needs_create",
        idempotency_key: "lokala_connect_abc",
        stripe_account_id: null,
      }),
    });
    assert.deepEqual(await parseReservation(admin, merchant.id, false), {
      outcome: "needs_create",
      idempotencyKey: "lokala_connect_abc",
    });
  });
});

describe("startConnectOnboarding", () => {
  it("creates an Express account with the stored idempotency key and returns only a URL", async () => {
    const { admin, calls } = jsonRpc({
      service_get_platform_stripe_livemode: () => false,
      service_reserve_stripe_connect_account: () => ({
        outcome: "needs_create",
        idempotency_key: "lokala_connect_stored",
        stripe_account_id: null,
      }),
      service_finalize_stripe_connected_account: () => ({
        finalized: true,
        stripe_account_id: "acct_mock_1",
      }),
    });
    const { stripe, creates } = mockStripe();
    const result = await startConnectOnboarding({
      stripe,
      admin,
      merchant,
      userEmail: "owner@example.test",
      platformLive: false,
      origin: "http://127.0.0.1:3000",
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, {
        url: "https://connect.stripe.com/setup/s/mock",
      });
      assert.equal(payloadHasForbiddenFields(result.value), false);
    }
    assert.equal(creates.length, 1);
    assert.deepEqual(creates[0]?.options, {
      idempotencyKey: "lokala_connect_stored",
    });
    const params = creates[0]?.params as {
      capabilities?: Record<string, unknown>;
    };
    assert.deepEqual(params.capabilities, { transfers: { requested: true } });
    assert.equal("card_payments" in (params.capabilities ?? {}), false);
    assert.equal(
      calls.some((call) => call.fn === "service_finalize_stripe_connected_account"),
      true,
    );
  });

  it("reuses an existing current-mode account and does not call accounts.create", async () => {
    const { admin } = jsonRpc({
      service_get_platform_stripe_livemode: () => false,
      service_reserve_stripe_connect_account: () => ({
        outcome: "already_connected",
        stripe_account_id: "acct_existing",
        idempotency_key: null,
      }),
    });
    const { stripe, creates } = mockStripe();
    const result = await startConnectOnboarding({
      stripe,
      admin,
      merchant,
      userEmail: null,
      platformLive: false,
      origin: "http://127.0.0.1:3000",
    });
    assert.equal(result.ok, true);
    assert.equal(creates.length, 0);
  });

  it("does not call Stripe when the platform livemode RPC fails", async () => {
    const admin: ConnectAdminRpc = {
      async rpc() {
        return {
          data: null,
          error: { message: "Invalid API key", code: "PGRST301" },
          status: 401,
        };
      },
    };
    const { stripe, creates } = mockStripe();
    const logs: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const result = await startConnectOnboarding({
        stripe,
        admin,
        merchant,
        userEmail: null,
        platformLive: false,
        origin: "http://127.0.0.1:3000",
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 500);
        assert.equal(result.error, CONNECT_CLIENT_ERRORS.generic);
        assert.notEqual(result.error, CONNECT_CLIENT_ERRORS.notConfigured);
      }
      assert.equal(creates.length, 0);
      const logged = logs.find(
        (entry) =>
          Array.isArray(entry) &&
          String(entry[0]).includes("platform_livemode_failed"),
      );
      assert.equal(Array.isArray(logged), true);
      const detail = Array.isArray(logged) ? logged[1] : null;
      const row = detail as Record<string, unknown>;
      assert.equal(row.code, "PGRST301");
      assert.equal(row.status, 401);
      assert.equal(row.message, "Invalid API key");
    } finally {
      console.error = originalError;
    }
  });

  it("logs Stripe create failures with safe fields and does not retry Stripe", async () => {
    const { admin } = jsonRpc({
      service_get_platform_stripe_livemode: () => false,
      service_reserve_stripe_connect_account: () => ({
        outcome: "needs_create",
        idempotency_key: "lokala_connect_stored",
        stripe_account_id: null,
      }),
    });
    const stripeError = Object.assign(new Error("Connect is not enabled for this account."), {
      name: "StripeInvalidRequestError",
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
      code: "account_invalid",
      statusCode: 400,
      requestId: "req_mock",
    });
    const { stripe, creates } = mockStripe({
      create: async () => {
        throw stripeError;
      },
    });
    const logs: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const result = await startConnectOnboarding({
        stripe,
        admin,
        merchant,
        userEmail: null,
        platformLive: false,
        origin: "http://127.0.0.1:3000",
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 500);
        assert.equal(result.error, CONNECT_CLIENT_ERRORS.generic);
      }
      assert.equal(creates.length, 1);
      const createFailed = logs.find(
        (entry) =>
          Array.isArray(entry) &&
          String(entry[0]).includes("stripe_create_failed"),
      );
      assert.equal(Array.isArray(createFailed), true);
      const detail = Array.isArray(createFailed) ? createFailed[1] : null;
      assert.equal(typeof detail, "object");
      const row = detail as Record<string, unknown>;
      assert.equal(row.code, "account_invalid");
      assert.equal(row.statusCode, 400);
      assert.equal(row.message, "Connect is not enabled for this account.");
      assert.equal(JSON.stringify(logs).includes("acct_"), false);
    } finally {
      console.error = originalError;
    }
  });

  it("rejects a platform livemode mismatch", async () => {
    const { admin } = jsonRpc({
      service_get_platform_stripe_livemode: () => true,
    });
    const { stripe, creates } = mockStripe();
    const result = await startConnectOnboarding({
      stripe,
      admin,
      merchant,
      userEmail: null,
      platformLive: false,
      origin: "http://127.0.0.1:3000",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.error, CONNECT_CLIENT_ERRORS.modeMismatch);
    }
    assert.equal(creates.length, 0);
  });

  it("surfaces a transfers-only configuration error without expanding capabilities", async () => {
    const { admin } = jsonRpc({
      service_get_platform_stripe_livemode: () => false,
      service_reserve_stripe_connect_account: () => ({
        outcome: "needs_create",
        idempotency_key: "lokala_connect_stored",
        stripe_account_id: null,
      }),
    });
    const { stripe } = mockStripe({
      create: async () => {
        throw new Error("You cannot request the `transfers` capability without `card_payments`.");
      },
    });
    const result = await startConnectOnboarding({
      stripe,
      admin,
      merchant,
      userEmail: null,
      platformLive: false,
      origin: "http://127.0.0.1:3000",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.error, CONNECT_CLIENT_ERRORS.transfersOnlyRejected);
      assert.equal(result.error.includes("acct_"), false);
    }
  });
});

describe("syncConnectedAccountFromStripe", () => {
  it("does not treat returning from Stripe as completion", async () => {
    const { admin, calls } = jsonRpc({
      service_get_stripe_connected_account: () => ({
        stripe_account_id: "acct_existing",
      }),
      service_sync_stripe_connected_account: () => ({ matched: true }),
    });
    const { stripe } = mockStripe();
    const result = await syncConnectedAccountFromStripe({
      stripe,
      admin,
      merchantAccountId: merchant.id,
      platformLive: false,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value?.onboarding_status, "restricted");
    }
    const sync = calls.find(
      (call) => call.fn === "service_sync_stripe_connected_account",
    );
    assert.equal(sync?.args?.p_onboarding_status, "restricted");
  });
});

describe("createExpressLoginLink", () => {
  it("returns only a URL for an eligible Express account", async () => {
    const { admin } = jsonRpc({
      service_get_stripe_connected_account: () => ({
        stripe_account_id: "acct_existing",
      }),
    });
    const { stripe, loginLinks } = mockStripe({
      retrieve: async (id) => ({
        id,
        details_submitted: true,
        payouts_enabled: true,
        capabilities: { transfers: "active" },
      }),
    });
    const result = await createExpressLoginLink({
      stripe,
      admin,
      merchantAccountId: merchant.id,
      platformLive: false,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.value.url,
        "https://connect.stripe.com/express/login/mock",
      );
      assert.equal(payloadHasForbiddenFields(result.value), false);
    }
    assert.equal(loginLinks.length, 1);
  });

  it("returns 409 ONBOARDING_INCOMPLETE without calling createLoginLink", async () => {
    const { admin } = jsonRpc({
      service_get_stripe_connected_account: () => ({
        stripe_account_id: "acct_existing",
      }),
    });
    const { stripe, loginLinks } = mockStripe({
      retrieve: async (id) => ({
        id,
        details_submitted: false,
        payouts_enabled: false,
        capabilities: { transfers: "inactive" },
      }),
    });
    const result = await createExpressLoginLink({
      stripe,
      admin,
      merchantAccountId: merchant.id,
      platformLive: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.code, "ONBOARDING_INCOMPLETE");
      assert.equal(result.error, CONNECT_CLIENT_ERRORS.onboardingIncomplete);
    }
    assert.equal(loginLinks.length, 0);
  });

  it("maps Stripe's incomplete-onboarding login error to 409", async () => {
    const { admin } = jsonRpc({
      service_get_stripe_connected_account: () => ({
        stripe_account_id: "acct_existing",
      }),
    });
    const { stripe } = mockStripe({
      retrieve: async (id) => ({ id, details_submitted: true }),
      createLoginLink: async () => {
        throw new Error(
          "Cannot create a login link for an account that has not completed onboarding.",
        );
      },
    });
    const result = await createExpressLoginLink({
      stripe,
      admin,
      merchantAccountId: merchant.id,
      platformLive: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.code, "ONBOARDING_INCOMPLETE");
    }
  });

  it("rejects when no current-mode account exists", async () => {
    const { admin } = jsonRpc({
      service_get_stripe_connected_account: () => ({ stripe_account_id: null }),
    });
    const { stripe } = mockStripe();
    const result = await createExpressLoginLink({
      stripe,
      admin,
      merchantAccountId: merchant.id,
      platformLive: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
  });
});

describe("isTransfersOnlyRejected", () => {
  it("detects a card_payments requirement without exposing Stripe internals", () => {
    assert.equal(
      isTransfersOnlyRejected(new Error("card_payments capability required")),
      true,
    );
    assert.equal(isTransfersOnlyRejected(new Error("rate limit")), false);
  });
});

describe("sanitizeConnectError", () => {
  it("keeps PostgREST code and a safe message", () => {
    assert.deepEqual(
      sanitizeConnectError({ message: "Invalid API key", code: "PGRST301" }),
      { type: "object", code: "PGRST301", message: "Invalid API key" },
    );
  });

  it("keeps PostgREST details and HTTP status when present", () => {
    assert.deepEqual(
      sanitizeConnectError({
        message: "Could not find the function",
        code: "PGRST202",
        details: "Searched for the function public.service_get_platform_stripe_livemode without parameters",
        hint: "Perhaps you meant the function that does exist",
        status: 404,
      }),
      {
        type: "object",
        code: "PGRST202",
        status: 404,
        message: "Could not find the function",
        details:
          "Searched for the function public.service_get_platform_stripe_livemode without parameters",
        hint: "Perhaps you meant the function that does exist",
      },
    );
  });

  it("keeps Stripe statusCode and a safe message", () => {
    const detail = sanitizeConnectError({
      name: "StripeInvalidRequestError",
      message: "Connect is not enabled for this account.",
      code: "account_invalid",
      statusCode: 400,
      requestId: "req_mock",
      type: "StripeInvalidRequestError",
    });
    assert.equal(detail.code, "account_invalid");
    assert.equal(detail.statusCode, 400);
    assert.equal(detail.requestId, "req_mock");
    assert.equal(detail.message, "Connect is not enabled for this account.");
  });

  it("omits secret-like message text", () => {
    const detail = sanitizeConnectError({
      message: "key sk_test_example is invalid",
      code: "invalid_api_key",
    });
    assert.equal(detail.code, "invalid_api_key");
    assert.equal("message" in detail, false);
  });
});

describe("payloadHasForbiddenFields", () => {
  it("allows an Account Link URL that includes acct_ in the path", () => {
    assert.equal(
      payloadHasForbiddenFields({
        url: "https://connect.stripe.com/setup/c/acct_1Example/token",
      }),
      false,
    );
  });

  it("rejects a separate stripe_account_id field", () => {
    assert.equal(
      payloadHasForbiddenFields({
        url: "https://connect.stripe.com/setup/s/mock",
        stripe_account_id: "acct_1Example",
      }),
      true,
    );
  });
});

describe("connectJson", () => {
  it("returns the incomplete-onboarding body at 409", async () => {
    const response = connectJson(
      {
        error: CONNECT_CLIENT_ERRORS.onboardingIncomplete,
        code: "ONBOARDING_INCOMPLETE",
      },
      409,
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: CONNECT_CLIENT_ERRORS.onboardingIncomplete,
      code: "ONBOARDING_INCOMPLETE",
    });
  });
});
