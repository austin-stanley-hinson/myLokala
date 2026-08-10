/**
 * Gift metadata + legacy confirm read-only checks. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { isGiftCertificatePaymentKind } from "./gift-metadata.ts";

const confirmRoutePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../app/api/stripe/gift-certificate/confirm/route.ts",
);

describe("isGiftCertificatePaymentKind", () => {
  it("accepts current and legacy metadata kinds", () => {
    assert.equal(isGiftCertificatePaymentKind("gift_certificate_purchase"), true);
    assert.equal(isGiftCertificatePaymentKind("gift_certificate"), true);
  });

  it("rejects unrelated kinds", () => {
    assert.equal(isGiftCertificatePaymentKind("merchant_qr_payment"), false);
    assert.equal(isGiftCertificatePaymentKind(undefined), false);
    assert.equal(isGiftCertificatePaymentKind(null), false);
  });
});

describe("gift confirm route stays read-only", () => {
  it("does not call deliver_gift_certificate or mutate ledgers", () => {
    const source = readFileSync(confirmRoutePath, "utf8");
    assert.equal(source.includes("deliver_gift_certificate"), false);
    assert.equal(source.includes(".rpc("), false);
    assert.equal(source.includes('from("payment_transactions")'), false);
    assert.equal(source.includes('from("gift_certificates")'), false);
  });
});
