import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
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
});
