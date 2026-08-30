/**
 * Connect readiness unit tests. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  connectedAccountUsableInMode,
  deriveConnectOnboardingStatus,
  isConnectReadyForSettlement,
  readinessPatchFromStripeAccount,
  transfersCapabilityActive,
  type ConnectReadinessPatch,
} from "./connect-readiness.ts";

const completeInput = {
  details_submitted: true,
  payouts_enabled: true,
  transfers_enabled: true,
  currently_due: [] as string[],
  past_due: [] as string[],
  eventually_due: [] as string[],
  disabled_reason: null as string | null,
};

function completePatch(
  overrides: Partial<ConnectReadinessPatch> = {},
): ConnectReadinessPatch {
  return {
    charges_enabled: false,
    payouts_enabled: true,
    transfers_enabled: true,
    details_submitted: true,
    onboarding_status: "complete",
    livemode: false,
    disabled_reason: null,
    requirements_currently_due: [],
    requirements_past_due: [],
    requirements_eventually_due: [],
    ...overrides,
  };
}

describe("deriveConnectOnboardingStatus", () => {
  it("is complete when payouts and transfers are enabled without dues", () => {
    assert.equal(deriveConnectOnboardingStatus(completeInput), "complete");
  });

  it("is complete even when charges_enabled would have been false", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
      }),
      "complete",
    );
  });

  it("is pending when details are in flight without open requirements", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        details_submitted: true,
        payouts_enabled: false,
        transfers_enabled: false,
      }),
      "pending",
    );
  });

  it("is pending when transfers are not yet active", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        transfers_enabled: false,
      }),
      "pending",
    );
  });

  it("is restricted when currently_due is outstanding", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        currently_due: ["external_account"],
      }),
      "restricted",
    );
  });

  it("is restricted when past_due is outstanding even if payouts look enabled", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        past_due: ["individual.verification.document"],
      }),
      "restricted",
    );
  });

  it("is restricted when requirements.past_due is a collection reason", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        details_submitted: false,
        payouts_enabled: false,
        transfers_enabled: false,
        disabled_reason: "requirements.past_due",
        currently_due: ["external_account"],
        past_due: ["external_account"],
      }),
      "restricted",
    );
  });

  it("is pending while Stripe reviews submitted details", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        payouts_enabled: false,
        transfers_enabled: false,
        disabled_reason: "requirements.pending_verification",
      }),
      "pending",
    );
  });

  it("is disabled when Stripe sets a listed/rejected reason", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        disabled_reason: "listed",
        currently_due: ["external_account"],
      }),
      "disabled",
    );
  });

  it("does not treat eventually_due as restricted", () => {
    assert.equal(
      deriveConnectOnboardingStatus({
        ...completeInput,
        eventually_due: ["individual.verification.document"],
      }),
      "complete",
    );
  });
});

describe("transfersCapabilityActive", () => {
  it("is true only for the active transfers capability", () => {
    assert.equal(transfersCapabilityActive({ transfers: "active" }), true);
    assert.equal(transfersCapabilityActive({ transfers: "pending" }), false);
    assert.equal(transfersCapabilityActive({ transfers: "inactive" }), false);
    assert.equal(transfersCapabilityActive(null), false);
    assert.equal(transfersCapabilityActive({}), false);
  });
});

describe("readinessPatchFromStripeAccount", () => {
  it("maps Stripe Account fields without requiring charges_enabled", () => {
    const patch = readinessPatchFromStripeAccount(
      {
        charges_enabled: false,
        payouts_enabled: true,
        details_submitted: true,
        capabilities: { transfers: "active" },
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: ["individual.verification.document"],
          disabled_reason: null,
        },
      },
      false,
    );

    assert.equal(patch.onboarding_status, "complete");
    assert.equal(patch.charges_enabled, false);
    assert.equal(patch.transfers_enabled, true);
    assert.equal(patch.payouts_enabled, true);
    assert.deepEqual(patch.requirements_eventually_due, [
      "individual.verification.document",
    ]);
    assert.equal(patch.livemode, false);
  });

  it("maps a restricted account from currently_due", () => {
    const patch = readinessPatchFromStripeAccount(
      {
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        capabilities: { transfers: "pending" },
        requirements: { currently_due: ["external_account"], past_due: [] },
      },
      true,
    );
    assert.equal(patch.onboarding_status, "restricted");
    assert.equal(patch.livemode, true);
    assert.equal(patch.transfers_enabled, false);
  });

  it("maps requirements.past_due on an incomplete account to restricted", () => {
    const patch = readinessPatchFromStripeAccount(
      {
        payouts_enabled: false,
        details_submitted: false,
        capabilities: { transfers: "inactive" },
        requirements: {
          currently_due: ["business_profile.url"],
          past_due: ["business_profile.url"],
          disabled_reason: "requirements.past_due",
        },
      },
      false,
    );
    assert.equal(patch.onboarding_status, "restricted");
    assert.equal(patch.details_submitted, false);
    assert.equal(patch.disabled_reason, "requirements.past_due");
  });

  it("maps listed disabled_reason to disabled", () => {
    const patch = readinessPatchFromStripeAccount(
      {
        payouts_enabled: false,
        details_submitted: true,
        capabilities: { transfers: "inactive" },
        requirements: {
          currently_due: [],
          past_due: [],
          disabled_reason: "listed",
        },
      },
      false,
    );
    assert.equal(patch.onboarding_status, "disabled");
    assert.equal(patch.disabled_reason, "listed");
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

  it("rejects missing livemode rather than guessing test-era rows", () => {
    assert.equal(connectedAccountUsableInMode(null, false), false);
    assert.equal(connectedAccountUsableInMode(undefined, false), false);
  });
});

describe("isConnectReadyForSettlement", () => {
  it("is ready for a matching-mode complete transfers account", () => {
    assert.equal(isConnectReadyForSettlement(completePatch(), false), true);
  });

  it("is ready even when charges_enabled is false", () => {
    assert.equal(
      isConnectReadyForSettlement(completePatch({ charges_enabled: false }), false),
      true,
    );
  });

  it("rejects a mode mismatch", () => {
    assert.equal(
      isConnectReadyForSettlement(completePatch({ livemode: true }), false),
      false,
    );
  });

  it("rejects missing transfers", () => {
    assert.equal(
      isConnectReadyForSettlement(
        completePatch({
          transfers_enabled: false,
          onboarding_status: "pending",
        }),
        false,
      ),
      false,
    );
  });

  it("rejects currently_due even if status were complete", () => {
    assert.equal(
      isConnectReadyForSettlement(
        completePatch({ requirements_currently_due: ["external_account"] }),
        false,
      ),
      false,
    );
  });

  it("does not reject eventually_due", () => {
    assert.equal(
      isConnectReadyForSettlement(
        completePatch({
          requirements_eventually_due: ["individual.verification.document"],
        }),
        false,
      ),
      true,
    );
  });

  it("rejects disabled_reason", () => {
    assert.equal(
      isConnectReadyForSettlement(
        completePatch({
          disabled_reason: "listed",
          onboarding_status: "disabled",
        }),
        false,
      ),
      false,
    );
  });
});
