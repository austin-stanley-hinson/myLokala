import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  connectPayoutView,
  parseMerchantConnectStatus,
} from "./connect-status.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("parseMerchantConnectStatus", () => {
  it("maps safe RPC fields and ignores stripe_account_id", () => {
    const status = parseMerchantConnectStatus({
      onboarding_status: "complete",
      has_connected_account: true,
      payouts_enabled: true,
      transfers_enabled: true,
      details_submitted: true,
      charges_enabled: false,
      livemode: false,
      livemode_matches: true,
      disabled_reason: null,
      requirements_currently_due: [],
      requirements_past_due: [],
      requirements_eventually_due: ["individual.verification.document"],
      ready_for_settlement: true,
      stripe_account_id: "acct_should_never_leak",
    });
    assert.equal(status.readyForSettlement, true);
    assert.equal(status.chargesEnabled, false);
    assert.deepEqual(status.requirementsEventuallyDue, [
      "individual.verification.document",
    ]);
    assert.equal(
      JSON.stringify(status).includes("acct_should_never_leak"),
      false,
    );
    assert.equal("stripe_account_id" in status, false);
  });
});

describe("connectPayoutView", () => {
  const incomplete = parseMerchantConnectStatus({
    onboarding_status: "disabled",
    has_connected_account: true,
    payouts_enabled: false,
    transfers_enabled: false,
    details_submitted: false,
    charges_enabled: false,
    livemode: false,
    livemode_matches: true,
    disabled_reason: "requirements.past_due",
    requirements_currently_due: ["business_profile.url"],
    requirements_past_due: ["business_profile.url"],
    requirements_eventually_due: [],
    ready_for_settlement: false,
  });

  const complete = parseMerchantConnectStatus({
    onboarding_status: "complete",
    has_connected_account: true,
    payouts_enabled: true,
    transfers_enabled: true,
    details_submitted: true,
    charges_enabled: false,
    livemode: false,
    livemode_matches: true,
    disabled_reason: null,
    requirements_currently_due: [],
    requirements_past_due: [],
    requirements_eventually_due: [],
    ready_for_settlement: true,
  });

  const pending = parseMerchantConnectStatus({
    onboarding_status: "pending",
    has_connected_account: true,
    payouts_enabled: false,
    transfers_enabled: false,
    details_submitted: true,
    charges_enabled: false,
    livemode: false,
    livemode_matches: true,
    disabled_reason: "requirements.pending_verification",
    requirements_currently_due: [],
    requirements_past_due: [],
    requirements_eventually_due: [],
    ready_for_settlement: false,
  });

  const restricted = parseMerchantConnectStatus({
    onboarding_status: "restricted",
    has_connected_account: true,
    payouts_enabled: false,
    transfers_enabled: true,
    details_submitted: true,
    charges_enabled: false,
    livemode: false,
    livemode_matches: true,
    disabled_reason: "requirements.past_due",
    requirements_currently_due: ["external_account"],
    requirements_past_due: [],
    requirements_eventually_due: [],
    ready_for_settlement: false,
  });

  it("maps outstanding requirements.* on an incomplete account to setup incomplete", () => {
    const view = connectPayoutView(incomplete, true);
    assert.equal(view.tone, "incomplete");
    assert.equal(view.pillLabel, "Setup incomplete");
    assert.equal(
      view.description,
      "Complete the required business and identity information to enable payouts.",
    );
    assert.equal(view.showOnboard, true);
    assert.equal(view.showLogin, false);
    assert.equal(view.onboardLabel, "Continue Stripe setup");
  });

  it("does not treat a listed/rejected account as setup incomplete", () => {
    const view = connectPayoutView(
      parseMerchantConnectStatus({
        onboarding_status: "disabled",
        has_connected_account: true,
        payouts_enabled: false,
        transfers_enabled: false,
        details_submitted: true,
        disabled_reason: "listed",
        ready_for_settlement: false,
      }),
      true,
    );
    assert.equal(view.tone, "disabled");
    assert.equal(view.showOnboard, true);
  });

  it("offers the dashboard only after details are submitted", () => {
    assert.equal(connectPayoutView(complete, true).showLogin, true);
    assert.equal(connectPayoutView(complete, true).showOnboard, false);
    assert.equal(connectPayoutView(restricted, true).showLogin, true);
    assert.equal(connectPayoutView(restricted, true).showOnboard, true);
    assert.equal(connectPayoutView(pending, true).showLogin, true);
    assert.equal(connectPayoutView(pending, true).tone, "pending");
  });

  it("hides mutation buttons for staff", () => {
    const view = connectPayoutView(incomplete, false);
    assert.equal(view.showOnboard, false);
    assert.equal(view.showLogin, false);
  });
});

describe("connect routes drop legacy payment-account coupling", () => {
  const files = [
    "src/app/api/stripe/connect/onboard/route.ts",
    "src/app/api/stripe/connect/webhook/route.ts",
    "src/app/api/stripe/connect/login-link/route.ts",
    "src/app/business/payments/page.tsx",
    "src/app/business/payments/return/page.tsx",
    "src/lib/stripe/connect-onboarding.ts",
    "src/lib/stripe/connect-webhook.ts",
  ];

  for (const file of files) {
    it(`${file} does not touch legacy Connect auth or tables`, () => {
      const source = readFileSync(join(root, file), "utf8");
      assert.equal(source.includes("business_payment_accounts"), false);
      assert.equal(source.includes("isBusinessOwner"), false);
      assert.equal(source.includes("account_type"), false);
      assert.equal(source.includes("webhook-claim"), false);
    });
  }

  it("login-link route forwards an incomplete-onboarding code instead of a bare 500", () => {
    const source = readFileSync(
      join(root, "src/app/api/stripe/connect/login-link/route.ts"),
      "utf8",
    );
    assert.equal(source.includes("result.code"), true);
    assert.equal(source.includes("createExpressLoginLink"), true);
  });
});
