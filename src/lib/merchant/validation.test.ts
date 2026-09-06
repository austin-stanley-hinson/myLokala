/**
 * Merchant setup validation + error-mapping tests. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  merchantSetupErrorMessage,
  paymentHubPath,
  paymentHubUrl,
  validateMerchantLocation,
  validateMerchantProfile,
} from "./validation.ts";

const blankProfile = {
  displayName: "",
  legalName: "",
  description: "",
  supportEmail: "",
  supportPhone: "",
  websiteUrl: "",
};

const blankLocation = {
  label: "",
  addressText: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  latitude: "",
  longitude: "",
  timezone: "",
};

describe("validateMerchantProfile", () => {
  it("requires a display name", () => {
    const result = validateMerchantProfile({
      ...blankProfile,
      displayName: "   ",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.displayName, "Business name is required.");
    }
  });

  it("rejects an invalid support email", () => {
    const result = validateMerchantProfile({
      ...blankProfile,
      displayName: "Cafe",
      supportEmail: "not-an-email",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.supportEmail);
  });

  it("rejects a non-http website", () => {
    const result = validateMerchantProfile({
      ...blankProfile,
      displayName: "Cafe",
      websiteUrl: "javascript:alert(1)",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.websiteUrl);
  });

  it("normalizes optional blanks to null and accepts a valid profile", () => {
    const result = validateMerchantProfile({
      displayName: "  Main Street Cafe  ",
      legalName: "  ",
      description: "Local coffee",
      supportEmail: "Info@Example.com",
      supportPhone: "207-555-0100",
      websiteUrl: "https://example.com",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, {
        displayName: "Main Street Cafe",
        legalName: null,
        description: "Local coffee",
        supportEmail: "info@example.com",
        supportPhone: "207-555-0100",
        websiteUrl: "https://example.com",
      });
    }
  });
});

describe("validateMerchantLocation", () => {
  it("requires a location name", () => {
    const result = validateMerchantLocation(blankLocation);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.label, "Location name is required.");
  });

  it("rejects latitude without longitude", () => {
    const result = validateMerchantLocation({
      ...blankLocation,
      label: "Main Street",
      latitude: "44.55",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.latitude);
  });

  it("rejects an invalid status", () => {
    const result = validateMerchantLocation({
      ...blankLocation,
      label: "Main Street",
      status: "closed",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.status);
  });

  it("defaults country to US and accepts paired coordinates", () => {
    const result = validateMerchantLocation({
      ...blankLocation,
      label: " Main Street ",
      city: "Waterville",
      latitude: "44.552",
      longitude: "-69.632",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.label, "Main Street");
      assert.equal(result.value.country, "US");
      assert.equal(result.value.status, "active");
      assert.equal(result.value.latitude, 44.552);
      assert.equal(result.value.longitude, -69.632);
    }
  });
});

describe("paymentHubUrl", () => {
  it("builds a root-relative pay path from the public code", () => {
    assert.equal(paymentHubPath("abc"), "/pay/abc");
    assert.equal(
      paymentHubUrl("http://localhost:3000", "abc"),
      "http://localhost:3000/pay/abc",
    );
  });
});

describe("merchantSetupErrorMessage", () => {
  it("maps known RPC errors and hides schema internals", () => {
    assert.equal(
      merchantSetupErrorMessage({ message: "Not authorized" }),
      "You don't have permission to change this.",
    );
    assert.equal(
      merchantSetupErrorMessage({ message: "label is required" }),
      "Location name is required.",
    );
    assert.equal(
      merchantSetupErrorMessage({
        message: 'Could not find the table public.deals in the schema cache',
      }),
      "Something went wrong. Please try again.",
    );
  });
});
