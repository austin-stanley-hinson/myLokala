/**
 * Deterministic fee-engine tests. Run with `npm test`.
 *
 * Uses the Node built-in test runner with type stripping, so no test framework
 * dependency is added. Imports use explicit .ts extensions because Node
 * resolves the real files at runtime.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_AMOUNT_CENTS,
  calculateCustomerFeeCents,
  calculateGiftRedemptionFeeCents,
  feePolicyVersion,
  quotePayment,
  resolveCustomerTier,
} from "./fees.ts";
import { calculateConsumerGiftCardFee } from "../pricing/gift-card-fees.ts";

describe("customer fee tiers", () => {
  // Every boundary is exclusive: $25.00 belongs to the "under $50" tier.
  const boundaries: ReadonlyArray<[number, number, number]> = [
    // [baseCents, expectedRateBp, expectedFixedCents]
    [1, 750, 50],
    [2_499, 750, 50],
    [2_500, 700, 50],
    [4_999, 700, 50],
    [5_000, 550, 50],
    [7_499, 550, 50],
    [7_500, 500, 50],
    [9_999, 500, 50],
    [10_000, 475, 50],
    [19_999, 475, 50],
    [20_000, 445, 50],
    [29_999, 445, 50],
    [30_000, 425, 50],
    [49_999, 425, 50],
    [50_000, 415, 50],
    [499_999, 415, 50],
    [500_000, 410, 50],
    [4_999_999, 410, 50],
    [5_000_000, 405, 50],
    [9_999_999, 405, 50],
    [10_000_000, 400, 50],
    [49_999_999, 400, 50],
    [50_000_000, 395, 53],
    [MAX_AMOUNT_CENTS, 395, 53],
  ];

  for (const [baseCents, rateBp, fixedCents] of boundaries) {
    it(`selects ${rateBp}bp + ${fixedCents}c at ${baseCents} cents`, () => {
      const tier = resolveCustomerTier(baseCents);
      assert.equal(tier.rateBp, rateBp);
      assert.equal(tier.fixedCents, fixedCents);

      const expected = Math.round((baseCents * rateBp) / 10_000) + fixedCents;
      assert.equal(calculateCustomerFeeCents(baseCents), expected);
    });
  }

  it("matches hand-computed values from Colin's schedule", () => {
    // $24.00 -> 7.50% ($1.80) + $0.50 = $2.30
    assert.equal(calculateCustomerFeeCents(2_400), 230);
    // $50.00 -> 5.50% ($2.75) + $0.50 = $3.25
    assert.equal(calculateCustomerFeeCents(5_000), 325);
    // $100.00 -> 4.75% ($4.75) + $0.50 = $5.25
    assert.equal(calculateCustomerFeeCents(10_000), 525);
    // $250.00 -> 4.45% ($11.125 -> $11.13) + $0.50 = $11.63
    assert.equal(calculateCustomerFeeCents(25_000), 1_163);
  });
});

describe("rounding", () => {
  it("rounds a half cent up", () => {
    // 20c * 750bp = 1.5c exactly -> 2c, plus the 50c fixed fee.
    assert.equal(calculateCustomerFeeCents(20), 52);
  });

  it("never returns a fractional cent", () => {
    for (let base = 1; base <= 3_000; base += 7) {
      const fee = calculateCustomerFeeCents(base);
      assert.ok(Number.isInteger(fee), `fee for ${base} was not an integer`);
    }
  });

  it("agrees with the floating-point display helper across the range", () => {
    // Guards the dollars -> cents port: the customer must be charged exactly
    // what the UI showed them.
    const samples = [
      1, 20, 99, 100, 2_499, 2_500, 4_999, 5_000, 7_500, 9_999, 10_000, 12_345,
      19_999, 20_000, 25_000, 29_999, 30_000, 49_999, 50_000, 99_999, 100_000,
      499_999, 500_000, 1_234_567, 5_000_000, 10_000_000, 50_000_000,
    ];
    for (const baseCents of samples) {
      const legacyDollars = calculateConsumerGiftCardFee(baseCents / 100);
      const legacyCents = Math.round(legacyDollars * 100);
      assert.equal(
        calculateCustomerFeeCents(baseCents),
        legacyCents,
        `mismatch at ${baseCents} cents`,
      );
    }
  });
});

describe("ACH pricing", () => {
  it("is 1.5 percentage points below card with the same fixed fee", () => {
    // $100.00: card 4.75% + $0.50; ACH 3.25% + $0.50 = $3.75
    assert.equal(calculateCustomerFeeCents(10_000, "card"), 525);
    assert.equal(calculateCustomerFeeCents(10_000, "ach"), 375);
  });

  it("never produces a negative rate", () => {
    assert.ok(calculateCustomerFeeCents(1, "ach") >= 0);
  });

  it("stamps the shared colin_v1 pricing version for card and ACH", () => {
    assert.equal(feePolicyVersion("merchant_qr_payment", "card"), "colin_v1");
    assert.equal(feePolicyVersion("merchant_qr_payment", "ach"), "colin_v1");
    assert.equal(feePolicyVersion("gift_certificate_purchase", "card"), "colin_v1");
  });
});

describe("merchant QR payment", () => {
  // $24.00 subtotal + $4.80 tip.
  const quote = quotePayment({
    kind: "merchant_qr_payment",
    subtotalCents: 2_400,
    tipCents: 480,
  });

  it("charges a 2.5% merchant fee on the subtotal only", () => {
    assert.equal(quote.merchantFeeCents, 60); // 2.5% of $24.00
  });

  it("computes the customer fee from the subtotal, excluding the tip", () => {
    assert.equal(quote.customerFeeCents, 230); // 7.50% of $24.00 + $0.50
  });

  it("charges subtotal + tip + customer fee", () => {
    assert.equal(quote.chargedCents, 2_400 + 480 + 230);
    assert.equal(quote.chargedCents, 3_110);
  });

  it("nets the merchant subtotal + tip - merchant fee", () => {
    assert.equal(quote.merchantNetCents, 2_400 + 480 - 60);
    assert.equal(quote.merchantNetCents, 2_820);
  });

  it("sets the application fee to customer fee + merchant fee", () => {
    assert.equal(quote.applicationFeeCents, 230 + 60);
    assert.equal(quote.applicationFeeCents, 290);
  });

  it("stamps the policy version", () => {
    assert.equal(quote.feePolicyVersion, "colin_v1");
  });

  it("excludes the tip from every fee base", () => {
    const noTip = quotePayment({ kind: "merchant_qr_payment", subtotalCents: 2_400 });
    const bigTip = quotePayment({
      kind: "merchant_qr_payment",
      subtotalCents: 2_400,
      tipCents: 100_000,
    });
    assert.equal(noTip.customerFeeCents, bigTip.customerFeeCents);
    assert.equal(noTip.merchantFeeCents, bigTip.merchantFeeCents);
    assert.equal(noTip.applicationFeeCents, bigTip.applicationFeeCents);
  });

  it("keeps the ledger identity charged = subtotal + tip + customerFee", () => {
    for (const [subtotalCents, tipCents] of [
      [1, 0],
      [2_400, 480],
      [9_999, 1],
      [50_000, 12_345],
    ] as const) {
      const q = quotePayment({ kind: "merchant_qr_payment", subtotalCents, tipCents });
      assert.equal(
        q.chargedCents,
        q.subtotalCents + q.tipCents + q.customerFeeCents,
        `charged identity broken at ${subtotalCents}/${tipCents}`,
      );
      assert.equal(q.applicationFeeCents, q.customerFeeCents + q.merchantFeeCents);
      assert.equal(q.merchantNetCents, q.subtotalCents + q.tipCents - q.merchantFeeCents);
    }
  });
});

describe("gift certificate purchase", () => {
  const quote = quotePayment({
    kind: "gift_certificate_purchase",
    subtotalCents: 5_000,
  });

  it("charges no merchant fee (there is no merchant)", () => {
    assert.equal(quote.merchantFeeCents, 0);
    assert.equal(quote.merchantNetCents, 0);
  });

  it("charges face value plus the customer fee", () => {
    assert.equal(quote.customerFeeCents, 325); // 5.50% of $50 + $0.50
    assert.equal(quote.chargedCents, 5_325);
  });

  it("puts only the customer fee in the application fee", () => {
    assert.equal(quote.applicationFeeCents, 325);
  });

  it("rejects a tip", () => {
    assert.throws(
      () =>
        quotePayment({
          kind: "gift_certificate_purchase",
          subtotalCents: 5_000,
          tipCents: 100,
        }),
      /cannot carry a tip/,
    );
  });
});

describe("gift redemption fee", () => {
  it("is a flat 2.5% with no fixed component", () => {
    assert.equal(calculateGiftRedemptionFeeCents(10_000), 250);
    assert.equal(calculateGiftRedemptionFeeCents(2_500), 63); // 62.5 -> 63
  });
});

describe("input validation", () => {
  it("rejects non-integer cents", () => {
    assert.throws(
      () => quotePayment({ kind: "merchant_qr_payment", subtotalCents: 24.5 }),
      /integer number of cents/,
    );
  });

  it("rejects a zero or negative subtotal", () => {
    assert.throws(
      () => quotePayment({ kind: "merchant_qr_payment", subtotalCents: 0 }),
      /at least 1 cents/,
    );
    assert.throws(
      () => quotePayment({ kind: "merchant_qr_payment", subtotalCents: -100 }),
      /at least 1 cents/,
    );
  });

  it("rejects a negative tip", () => {
    assert.throws(
      () =>
        quotePayment({
          kind: "merchant_qr_payment",
          subtotalCents: 2_400,
          tipCents: -1,
        }),
      /at least 0 cents/,
    );
  });

  it("rejects amounts above the supported maximum", () => {
    assert.throws(
      () =>
        quotePayment({
          kind: "merchant_qr_payment",
          subtotalCents: MAX_AMOUNT_CENTS + 1,
        }),
      /maximum supported amount/,
    );
  });
});
