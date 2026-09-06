/**
 * Sign-up / resend failure-handling helper tests. Run with `npm test`.
 *
 * Pure functions, no network. These lock in the user-facing messaging, the
 * secret-free development diagnostic, and the resend payload.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEmailRedirectTo } from "./callback.ts";
import {
  EMAIL_DELIVERY_MESSAGE,
  buildAuthDiagnostic,
  buildResendSignupArgs,
  getSignupErrorMessage,
  isEmailDeliveryFailure,
} from "./signup-errors.ts";

describe("isEmailDeliveryFailure", () => {
  it("is true for an HTTP 500", () => {
    assert.equal(
      isEmailDeliveryFailure({ message: "Error sending confirmation email", status: 500 }),
      true,
    );
  });

  it("is true for the unexpected_failure code without a status", () => {
    assert.equal(
      isEmailDeliveryFailure({ message: "boom", code: "unexpected_failure" }),
      true,
    );
  });

  it("is true when the message names confirmation-email sending", () => {
    assert.equal(
      isEmailDeliveryFailure({ message: "Error sending confirmation email" }),
      true,
    );
  });

  it("is false for a rate-limit error", () => {
    assert.equal(
      isEmailDeliveryFailure({
        message: "Email rate limit exceeded",
        code: "over_email_send_rate_limit",
        status: 429,
      }),
      false,
    );
  });

  it("is false for an ordinary validation error and for null", () => {
    assert.equal(
      isEmailDeliveryFailure({ message: "Password should be at least 6 characters", status: 400 }),
      false,
    );
    assert.equal(isEmailDeliveryFailure(null), false);
  });
});

describe("getSignupErrorMessage", () => {
  it("returns the dedicated copy for a 500 email-delivery failure", () => {
    assert.equal(
      getSignupErrorMessage({ message: "Error sending confirmation email", status: 500 }),
      EMAIL_DELIVERY_MESSAGE,
    );
  });

  it("preserves the Supabase message for a rate-limit error", () => {
    assert.equal(
      getSignupErrorMessage({
        message: "Email rate limit exceeded",
        code: "over_email_send_rate_limit",
        status: 429,
      }),
      "Email rate limit exceeded",
    );
  });

  it("preserves the Supabase message for an ordinary validation error", () => {
    assert.equal(
      getSignupErrorMessage({
        message: "Password should be at least 6 characters",
        code: "weak_password",
        status: 400,
      }),
      "Password should be at least 6 characters",
    );
  });

  it("falls back to a generic message only when there is no message", () => {
    assert.equal(getSignupErrorMessage({ status: 400 }), "Something went wrong. Please try again.");
    assert.equal(getSignupErrorMessage(null), "Something went wrong. Please try again.");
  });
});

describe("buildAuthDiagnostic", () => {
  it("captures message, code, and status", () => {
    assert.deepEqual(
      buildAuthDiagnostic({ message: "boom", code: "weak_password", status: 400 }),
      { message: "boom", code: "weak_password", status: 400 },
    );
  });

  it("nulls out a missing code/status and keeps the message", () => {
    assert.deepEqual(buildAuthDiagnostic({ message: "boom" }), {
      message: "boom",
      code: null,
      status: null,
    });
  });

  it("exposes exactly the safe fields — no password/secret leakage", () => {
    const diagnostic = buildAuthDiagnostic({
      message: "boom",
      code: "unexpected_failure",
      status: 500,
      // Simulated hostile extra fields that must never be copied through.
      ...({
        password: "hunter2",
        access_token: "tok",
        anonKey: "anon",
        serviceRoleKey: "svc",
      } as unknown as Record<string, never>),
    });

    assert.deepEqual(Object.keys(diagnostic).sort(), ["code", "message", "status"]);
    const serialized = JSON.stringify(diagnostic);
    assert.equal(serialized.includes("hunter2"), false);
    assert.equal(serialized.includes("tok"), false);
    assert.equal(serialized.includes("anon"), false);
    assert.equal(serialized.includes("svc"), false);
  });
});

describe("buildResendSignupArgs", () => {
  it("builds a signup resend payload with the correct redirect URL", () => {
    const args = buildResendSignupArgs(
      "owner@example.com",
      buildEmailRedirectTo("http://localhost:3000"),
    );
    assert.deepEqual(args, {
      type: "signup",
      email: "owner@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=/business" },
    });
  });
});
