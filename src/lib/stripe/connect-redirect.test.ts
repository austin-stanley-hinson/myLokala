import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAllowedStripeConnectRedirectUrl,
  parseConnectRedirectResponse,
} from "./connect-redirect.ts";

describe("isAllowedStripeConnectRedirectUrl", () => {
  it("accepts a hosted Account Link that includes acct_ in the path", () => {
    assert.equal(
      isAllowedStripeConnectRedirectUrl(
        "https://connect.stripe.com/setup/c/acct_1ExampleAccount/TqckGNUHg2mG",
      ),
      true,
    );
  });

  it("rejects non-HTTPS and non-Stripe hosts", () => {
    assert.equal(
      isAllowedStripeConnectRedirectUrl(
        "http://connect.stripe.com/setup/c/acct_1Example/token",
      ),
      false,
    );
    assert.equal(
      isAllowedStripeConnectRedirectUrl("https://evil.example/connect.stripe.com"),
      false,
    );
    assert.equal(
      isAllowedStripeConnectRedirectUrl(
        "https://connect.stripe.com.evil.example/setup",
      ),
      false,
    );
  });
});

describe("parseConnectRedirectResponse", () => {
  it("returns the Account Link URL even when the path contains acct_", () => {
    const parsed = parseConnectRedirectResponse(
      {
        url: "https://connect.stripe.com/setup/c/acct_1ExampleAccount/token",
      },
      true,
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(
        parsed.url,
        "https://connect.stripe.com/setup/c/acct_1ExampleAccount/token",
      );
    }
  });

  it("rejects a non-Stripe HTTPS URL", () => {
    const parsed = parseConnectRedirectResponse(
      { url: "https://example.test/setup" },
      true,
    );
    assert.equal(parsed.ok, false);
  });

  it("rejects responses that contain Stripe secrets", () => {
    const parsed = parseConnectRedirectResponse(
      {
        url: "https://connect.stripe.com/setup/s/mock",
        extra: "sk_test_example",
      },
      true,
    );
    assert.equal(parsed.ok, false);
  });

  it("surfaces a server error message on non-OK responses", () => {
    const parsed = parseConnectRedirectResponse(
      {
        error: "Complete Stripe onboarding before opening the dashboard.",
        code: "ONBOARDING_INCOMPLETE",
      },
      false,
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(
        parsed.error,
        "Complete Stripe onboarding before opening the dashboard.",
      );
    }
  });
});
