/**
 * Auth-callback + email-confirmation flow tests. Run with `npm test`.
 *
 * These exercise the confirmation/session decision logic with an in-memory fake
 * Supabase client — no network and no hosted project access. They lock in the
 * behavior of the `/auth/callback` route (which is a thin wrapper around
 * `resolveAuthCallback`) plus the shared `safeNext` / `buildEmailRedirectTo`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailRedirectTo,
  isEmailVerifiedParam,
  resolveAuthCallback,
  safeNext,
  type AuthCallbackParams,
} from "./callback.ts";

const VERIFIED_ONBOARDING = "/business/onboarding?email_verified=1";

type Result = { data: unknown; error: unknown };

type FakeConfig = {
  members?: Result;
  user?: unknown;
  exchange?: { error: unknown };
  verify?: { error: unknown };
};

type Client = Parameters<typeof resolveAuthCallback>[0];

function queryBuilder(result: Result) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  chain.select = passthrough;
  chain.eq = passthrough;
  chain.order = passthrough;
  chain.limit = passthrough;
  chain.maybeSingle = async () => result;
  return chain;
}

function makeClient(config: FakeConfig) {
  const calls = { exchange: 0, verify: 0, getUser: 0 };
  const client = {
    from(table: string) {
      if (table === "merchant_members") {
        return queryBuilder(config.members ?? { data: null, error: null });
      }
      throw new Error(`unexpected table: ${table}`);
    },
    auth: {
      async exchangeCodeForSession() {
        calls.exchange += 1;
        return { data: {}, error: config.exchange?.error ?? null };
      },
      async verifyOtp() {
        calls.verify += 1;
        return { data: {}, error: config.verify?.error ?? null };
      },
      async getUser() {
        calls.getUser += 1;
        return { data: { user: config.user ?? null }, error: null };
      },
    },
  };
  return { client: client as unknown as Client, calls };
}

const baseParams = (over: Partial<AuthCallbackParams>): AuthCallbackParams => ({
  code: null,
  tokenHash: null,
  type: null,
  error: null,
  next: "/business",
  ...over,
});

describe("buildEmailRedirectTo", () => {
  it("targets our own /auth/callback origin with next=/business", () => {
    assert.equal(
      buildEmailRedirectTo("http://localhost:3000"),
      "http://localhost:3000/auth/callback?next=/business",
    );
  });

  it("honors an explicit next path", () => {
    assert.equal(
      buildEmailRedirectTo("https://app.example.com", "/reset-password"),
      "https://app.example.com/auth/callback?next=/reset-password",
    );
  });
});

describe("safeNext", () => {
  it("passes through a normal internal path", () => {
    assert.equal(safeNext("/business/payments"), "/business/payments");
  });

  it("defaults to /business when missing", () => {
    assert.equal(safeNext(null), "/business");
    assert.equal(safeNext(""), "/business");
  });

  it("rejects open-redirect vectors", () => {
    assert.equal(safeNext("//evil.example.com"), "/business");
    assert.equal(safeNext("https://evil.example.com"), "/business");
    assert.equal(safeNext("/\\evil.example.com"), "/business");
    assert.equal(safeNext("evil"), "/business");
  });
});

describe("resolveAuthCallback — code (PKCE) exchange", () => {
  it("exchanges the code and sends a confirmed non-member to onboarding", async () => {
    const { client, calls } = makeClient({
      user: { id: "u-1" },
      members: { data: null, error: null },
    });
    const target = await resolveAuthCallback(
      client,
      baseParams({ code: "auth-code" }),
    );
    assert.equal(target, VERIFIED_ONBOARDING);
    assert.equal(calls.exchange, 1);
    assert.equal(calls.getUser, 1);
  });

  it("sends a confirmed active member to the safe next path", async () => {
    const { client } = makeClient({
      user: { id: "u-1" },
      members: { data: { merchant_account_id: "m-1", role: "owner" }, error: null },
    });
    const target = await resolveAuthCallback(
      client,
      baseParams({ code: "auth-code", next: "/business/payments" }),
    );
    // Existing merchant goes straight to the dashboard — never flagged verified.
    assert.equal(target, "/business/payments");
    assert.ok(!target.includes("email_verified"));
  });
});

describe("resolveAuthCallback — token_hash (OTP) verification", () => {
  it("verifies the OTP and routes a confirmed non-member to onboarding", async () => {
    const { client, calls } = makeClient({
      user: { id: "u-2" },
      members: { data: null, error: null },
    });
    const target = await resolveAuthCallback(
      client,
      baseParams({ tokenHash: "hash", type: "signup" }),
    );
    assert.equal(target, VERIFIED_ONBOARDING);
    assert.equal(calls.verify, 1);
    assert.equal(calls.exchange, 0);
  });

  it("treats an unknown OTP type as a missing verification param", async () => {
    const { client, calls } = makeClient({ user: { id: "u-2" } });
    const target = await resolveAuthCallback(
      client,
      baseParams({ tokenHash: "hash", type: "not-a-type" }),
    );
    assert.equal(target, "/login?error=missing_code");
    assert.equal(calls.verify, 0);
  });
});

describe("resolveAuthCallback — failure behavior", () => {
  it("redirects to login when no verification parameter is present", async () => {
    const { client, calls } = makeClient({});
    const target = await resolveAuthCallback(client, baseParams({}));
    assert.equal(target, "/login?error=missing_code");
    assert.equal(calls.exchange, 0);
    assert.equal(calls.verify, 0);
  });

  it("redirects to login when GoTrue reports an error", async () => {
    const { client, calls } = makeClient({});
    const target = await resolveAuthCallback(
      client,
      baseParams({ code: "x", error: "otp_expired" }),
    );
    assert.equal(target, "/login?error=auth_callback");
    // The error short-circuits before any exchange attempt.
    assert.equal(calls.exchange, 0);
  });

  it("redirects to login when the code exchange fails", async () => {
    const { client } = makeClient({ exchange: { error: { message: "bad" } } });
    const target = await resolveAuthCallback(
      client,
      baseParams({ code: "bad-code" }),
    );
    assert.equal(target, "/login?error=auth_callback");
  });

  it("redirects to login when the OTP verification fails", async () => {
    const { client } = makeClient({ verify: { error: { message: "bad" } } });
    const target = await resolveAuthCallback(
      client,
      baseParams({ tokenHash: "hash", type: "recovery" }),
    );
    assert.equal(target, "/login?error=auth_callback");
  });

  it("redirects to login when no session is established after verify", async () => {
    const { client } = makeClient({ user: null });
    const target = await resolveAuthCallback(
      client,
      baseParams({ code: "auth-code" }),
    );
    assert.equal(target, "/login?error=no_session");
  });

  it("never marks a failed callback as email-verified", async () => {
    // Explicit GoTrue error, failed exchange, and missing session must all
    // route to /login without ever appending the presentation-only flag.
    const failures: AuthCallbackParams[] = [
      baseParams({ code: "x", error: "otp_expired" }),
      baseParams({}),
    ];
    for (const params of failures) {
      const { client } = makeClient({});
      const target = await resolveAuthCallback(client, params);
      assert.ok(target.startsWith("/login"));
      assert.ok(!target.includes("email_verified"));
    }

    const { client: badExchange } = makeClient({
      exchange: { error: { message: "bad" } },
      user: { id: "u-1" },
    });
    const exchangeTarget = await resolveAuthCallback(
      badExchange,
      baseParams({ code: "bad" }),
    );
    assert.ok(!exchangeTarget.includes("email_verified"));

    const { client: noSession } = makeClient({ user: null });
    const noSessionTarget = await resolveAuthCallback(
      noSession,
      baseParams({ code: "auth-code" }),
    );
    assert.ok(!noSessionTarget.includes("email_verified"));
  });
});

describe("isEmailVerifiedParam (onboarding success notice)", () => {
  it("is true only for the exact string flag from the callback", () => {
    assert.equal(isEmailVerifiedParam("1"), true);
  });

  it("is false for a direct visit / absent or arbitrary values", () => {
    assert.equal(isEmailVerifiedParam(undefined), false);
    assert.equal(isEmailVerifiedParam(null), false);
    assert.equal(isEmailVerifiedParam(""), false);
    assert.equal(isEmailVerifiedParam("0"), false);
    assert.equal(isEmailVerifiedParam("true"), false);
    // Repeated query params arrive as arrays and must not spoof the flag.
    assert.equal(isEmailVerifiedParam(["1"]), false);
  });
});
