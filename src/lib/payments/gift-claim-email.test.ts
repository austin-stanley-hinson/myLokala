/**
 * Gift-claim email copy + Resend send. Run with `npm test`.
 *
 * The "throws when RESEND_API_KEY is unset" test proves the failure mode
 * balance-purchase-webhook.ts depends on (a thrown error the caller must
 * catch and log, never propagate). The live-send tests replace
 * globalThis.fetch with a local fake for the duration of the test only --
 * no real network call is ever made, no real email is ever sent.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  GIFT_CLAIM_FROM_ADDRESS,
  buildGiftClaimEmail,
  buildGiftClaimUrl,
  sendGiftClaimEmailViaResend,
} from "./gift-claim-email.ts";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.RESEND_API_KEY;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.test";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("buildGiftClaimUrl", () => {
  it("builds an absolute claim link with the raw token, URL-encoded", () => {
    assert.equal(
      buildGiftClaimUrl("raw-token-abc123"),
      "https://preview.example.test/claim/raw-token-abc123",
    );
  });
});

describe("buildGiftClaimEmail", () => {
  it("includes the amount, the claim link, and an expiry date in both text and html", () => {
    const now = new Date("2026-08-30T00:00:00.000Z");
    const email = buildGiftClaimEmail(
      { to: "friend@example.com", amountCents: 2500, currency: "usd", claimToken: "tok-123" },
      now,
    );

    assert.match(email.subject, /\$25\.00/);
    assert.match(email.text, /\$25\.00/);
    assert.match(email.html, /\$25\.00/);
    assert.ok(email.text.includes("https://preview.example.test/claim/tok-123"));
    assert.ok(email.html.includes("https://preview.example.test/claim/tok-123"));
    // 30 days after 2026-08-30 is 2026-09-29.
    assert.ok(email.text.includes("September 29, 2026"));
    assert.ok(email.html.includes("September 29, 2026"));
  });

  it("never includes a hash-shaped string -- only the raw token belongs in the link", () => {
    const email = buildGiftClaimEmail({
      to: "friend@example.com",
      amountCents: 1000,
      currency: "usd",
      claimToken: "short-raw-token",
    });
    assert.ok(!/[0-9a-f]{64}/.test(email.html));
  });
});

describe("sendGiftClaimEmailViaResend", () => {
  it("throws when RESEND_API_KEY is not set, before making any network call", async () => {
    delete process.env.RESEND_API_KEY;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        sendGiftClaimEmailViaResend({
          to: "friend@example.com",
          amountCents: 1000,
          currency: "usd",
          claimToken: "tok",
        }),
      /RESEND_API_KEY/,
    );
    assert.equal(fetchCalled, false);
  });

  it("posts to Resend's API with the mail.mylokala.com from-address and the bearer key", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;

    await sendGiftClaimEmailViaResend({
      to: "friend@example.com",
      amountCents: 1500,
      currency: "usd",
      claimToken: "tok-xyz",
    });

    assert.equal(capturedUrl, "https://api.resend.com/emails");
    assert.equal(
      (capturedInit?.headers as Record<string, string>).Authorization,
      "Bearer re_test_key",
    );
    const body = JSON.parse(capturedInit?.body as string);
    assert.equal(body.from, GIFT_CLAIM_FROM_ADDRESS);
    assert.deepEqual(body.to, ["friend@example.com"]);
    assert.ok(String(body.from).includes("mail.mylokala.com"));
  });

  it("throws with the Resend status when the API responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async () =>
      new Response("invalid from address", { status: 422 })) as typeof fetch;

    await assert.rejects(
      () =>
        sendGiftClaimEmailViaResend({
          to: "friend@example.com",
          amountCents: 1000,
          currency: "usd",
          claimToken: "tok",
        }),
      /422/,
    );
  });
});
