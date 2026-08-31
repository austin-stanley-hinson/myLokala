/**
 * Purchaser-facing gift email copy + Resend send. Run with `npm test`.
 *
 * Same discipline as gift-claim-email.test.ts: globalThis.fetch is replaced
 * with a local fake for the duration of each test -- no real network call is
 * ever made, no real email is ever sent.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  buildGiftClaimedConfirmationEmail,
  buildGiftSentConfirmationEmail,
  sendGiftClaimedConfirmationEmailViaResend,
  sendGiftSentConfirmationEmailViaResend,
} from "./gift-purchaser-email.ts";
import { GIFT_CLAIM_FROM_ADDRESS } from "./gift-claim-email.ts";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.RESEND_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
});

describe("buildGiftSentConfirmationEmail", () => {
  it("includes the amount, recipient email, and the live expiry_days value", () => {
    const email = buildGiftSentConfirmationEmail({
      to: "purchaser@example.com",
      recipientEmail: "friend@example.com",
      amountCents: 2500,
      currency: "usd",
      expiryDays: 45,
    });

    assert.match(email.subject, /\$25\.00/);
    assert.ok(email.subject.includes("friend@example.com"));
    assert.ok(email.text.includes("friend@example.com"));
    assert.ok(email.html.includes("friend@example.com"));
    assert.ok(email.text.includes("45 days"));
    assert.ok(email.html.includes("45 days"));
  });

  it("reflects a different expiry_days value from platform_config, not a hardcoded one", () => {
    const email = buildGiftSentConfirmationEmail({
      to: "purchaser@example.com",
      recipientEmail: "friend@example.com",
      amountCents: 1000,
      currency: "usd",
      expiryDays: 7,
    });

    assert.ok(email.text.includes("7 days"));
    assert.ok(!email.text.includes("30 days"));
  });
});

describe("buildGiftClaimedConfirmationEmail", () => {
  it("includes the recipient label and the amount", () => {
    const email = buildGiftClaimedConfirmationEmail({
      to: "purchaser@example.com",
      recipientLabel: "Jordan",
      amountCents: 1500,
      currency: "usd",
    });

    assert.match(email.subject, /Jordan/);
    assert.match(email.subject, /claimed/);
    assert.ok(email.text.includes("$15.00"));
    assert.ok(email.html.includes("Jordan"));
  });

  it("falls back to whatever label the caller resolved (e.g. an email address)", () => {
    const email = buildGiftClaimedConfirmationEmail({
      to: "purchaser@example.com",
      recipientLabel: "friend@example.com",
      amountCents: 500,
      currency: "usd",
    });

    assert.ok(email.text.includes("friend@example.com"));
  });
});

describe("sendGiftSentConfirmationEmailViaResend", () => {
  it("throws when RESEND_API_KEY is not set, before making any network call", async () => {
    delete process.env.RESEND_API_KEY;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        sendGiftSentConfirmationEmailViaResend({
          to: "purchaser@example.com",
          recipientEmail: "friend@example.com",
          amountCents: 1000,
          currency: "usd",
          expiryDays: 30,
        }),
      /RESEND_API_KEY/,
    );
    assert.equal(fetchCalled, false);
  });

  it("posts to Resend's API addressed to the purchaser", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;

    await sendGiftSentConfirmationEmailViaResend({
      to: "purchaser@example.com",
      recipientEmail: "friend@example.com",
      amountCents: 1500,
      currency: "usd",
      expiryDays: 30,
    });

    const body = JSON.parse(capturedInit?.body as string);
    assert.equal(body.from, GIFT_CLAIM_FROM_ADDRESS);
    assert.deepEqual(body.to, ["purchaser@example.com"]);
  });

  it("throws with the Resend status when the API responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async () =>
      new Response("invalid from address", { status: 422 })) as typeof fetch;

    await assert.rejects(
      () =>
        sendGiftSentConfirmationEmailViaResend({
          to: "purchaser@example.com",
          recipientEmail: "friend@example.com",
          amountCents: 1000,
          currency: "usd",
          expiryDays: 30,
        }),
      /422/,
    );
  });
});

describe("sendGiftClaimedConfirmationEmailViaResend", () => {
  it("throws when RESEND_API_KEY is not set, before making any network call", async () => {
    delete process.env.RESEND_API_KEY;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        sendGiftClaimedConfirmationEmailViaResend({
          to: "purchaser@example.com",
          recipientLabel: "Jordan",
          amountCents: 1000,
          currency: "usd",
        }),
      /RESEND_API_KEY/,
    );
    assert.equal(fetchCalled, false);
  });

  it("posts to Resend's API addressed to the purchaser", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;

    await sendGiftClaimedConfirmationEmailViaResend({
      to: "purchaser@example.com",
      recipientLabel: "Jordan",
      amountCents: 1500,
      currency: "usd",
    });

    const body = JSON.parse(capturedInit?.body as string);
    assert.equal(body.from, GIFT_CLAIM_FROM_ADDRESS);
    assert.deepEqual(body.to, ["purchaser@example.com"]);
  });

  it("throws with the Resend status when the API responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async () =>
      new Response("invalid from address", { status: 422 })) as typeof fetch;

    await assert.rejects(
      () =>
        sendGiftClaimedConfirmationEmailViaResend({
          to: "purchaser@example.com",
          recipientLabel: "Jordan",
          amountCents: 1000,
          currency: "usd",
        }),
      /422/,
    );
  });
});
