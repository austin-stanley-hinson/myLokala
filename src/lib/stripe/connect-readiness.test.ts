/**
 * Connect readiness unit tests. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  connectedAccountUsableInMode,
  deriveConnectOnboardingStatus,
  readinessPatchFromStripeAccount,
} from "./connect-readiness.ts";

describe("deriveConnectOnboardingStatus", () => {
  it("is complete when charges and payouts are enabled", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        currently_due: ["external_account"],
        past_due: [],
      }),
      "complete",
    );
  });

  it("is restricted when requirements are outstanding and not fully enabled", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        currently_due: ["external_account"],
        past_due: [],
      }),
      "restricted",
    );
  });

  it("is pending when details are in flight without open requirements", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        currently_due: [],
        past_due: [],
      }),
      "pending",
    );
  });
});

describe("readinessPatchFromStripeAccount", () => {
  it("maps Stripe Account fields including livemode", () => {
    const patch = readinessPatchFromStripeAccount(
      {
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: { currently_due: [], past_due: [] },
      },
      true,
    );
    assert.deepEqual(patch, {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      onboarding_status: "complete",
      livemode: true,
    });
  });
});

describe("connectedAccountUsableInMode", () => {
  it("allows a matching live account on a live platform", () => {
    assert.equal(connectedAccountUsableInMode(true, true), true);
  });

  it("rejects a test account on a live platform", () => {
    assert.equal(connectedAccountUsableInMode(false, true), false);
  });

  it("rejects a live account on a test platform", () => {
    assert.equal(connectedAccountUsableInMode(true, false), false);
  });

  it("allows a matching test account on a test platform", () => {
    assert.equal(connectedAccountUsableInMode(false, false), true);
  });

  it("treats legacy null livemode as test-era only", () => {
    assert.equal(connectedAccountUsableInMode(null, false), true);
    assert.equal(connectedAccountUsableInMode(null, true), false);
    assert.equal(connectedAccountUsableInMode(undefined, true), false);
  });
});
