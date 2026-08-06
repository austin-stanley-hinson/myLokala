/**
 * Versioned Lokala fee engine. SERVER-ONLY.
 *
 * Every amount is an INTEGER NUMBER OF CENTS. There are no floats anywhere in
 * this module: rates are held in basis points (1 bp = 0.01%) so a rate like
 * 4.75% is the exact integer 475, and the only division is a single integer
 * divide that is immediately rounded. This is a deliberate port of
 * `src/lib/pricing/gift-card-fees.ts`, which computes the same schedule in
 * floating-point dollars for display; `fees.test.ts` asserts the two agree.
 *
 * This module NEVER accepts a client-supplied fee, total, or charged amount. It
 * takes only a subtotal, a tip, a payment kind, and a payment method, and
 * derives everything else. Callers must treat its output as authoritative.
 *
 * Launch policy (Austin, 2026-08-06):
 *   * Customer fee follows Colin's tiered schedule, applied to the SUBTOTAL.
 *   * Merchant fee is 2.5% of the subtotal, on merchant QR payments only.
 *   * TIPS ARE EXCLUDED from both fee bases and pass through to the merchant.
 *   * Stripe's processing cost is covered out of Lokala's collected fees; it is
 *     recorded on the ledger after settlement, never charged on top here.
 *   * Customer is charged subtotal + tip + customer fee.
 *   * Merchant nets subtotal + tip - merchant fee.
 *   * Stripe's application_fee_amount is customer fee + merchant fee.
 *
 * Rates change over time, so every breakdown carries the policy version that
 * produced it. Historical rows keep their version and their numbers; repricing
 * issues a NEW version and never rewrites past transactions.
 */

export type PaymentKind = "merchant_qr_payment" | "gift_certificate_purchase";

/** Card is live today. ACH is priced but not yet offered at checkout. */
export type PaymentMethod = "card" | "ach";

/** Merchant-side fee at gift-certificate redemption: 2.5%, in basis points. */
export const GIFT_REDEMPTION_FEE_BP = 250;

/** Merchant-side fee on a direct QR payment: 2.5% of subtotal, in basis points. */
export const MERCHANT_QR_FEE_BP = 250;

/** ACH is priced 1.5 percentage points below card, with the same fixed fee. */
const ACH_DISCOUNT_BP = 150;

/** Largest amount we will price. Stripe's own per-charge ceiling is $999,999.99. */
export const MAX_AMOUNT_CENTS = 99_999_999;

type CustomerTier = {
  /** Exclusive upper bound in cents (base < maxExclusiveCents). null = top tier. */
  maxExclusiveCents: number | null;
  rateBp: number;
  fixedCents: number;
};

/**
 * Colin's customer fee schedule, in cents and basis points.
 * Boundaries are exclusive: a $25.00 subtotal falls in the "under $50" tier.
 */
const CUSTOMER_TIERS: readonly CustomerTier[] = [
  { maxExclusiveCents: 2_500, rateBp: 750, fixedCents: 50 }, //      < $25    7.50% + $0.50
  { maxExclusiveCents: 5_000, rateBp: 700, fixedCents: 50 }, //      < $50    7.00% + $0.50
  { maxExclusiveCents: 7_500, rateBp: 550, fixedCents: 50 }, //      < $75    5.50% + $0.50
  { maxExclusiveCents: 10_000, rateBp: 500, fixedCents: 50 }, //     < $100   5.00% + $0.50
  { maxExclusiveCents: 20_000, rateBp: 475, fixedCents: 50 }, //     < $200   4.75% + $0.50
  { maxExclusiveCents: 30_000, rateBp: 445, fixedCents: 50 }, //     < $300   4.45% + $0.50
  { maxExclusiveCents: 50_000, rateBp: 425, fixedCents: 50 }, //     < $500   4.25% + $0.50
  { maxExclusiveCents: 500_000, rateBp: 415, fixedCents: 50 }, //    < $5k    4.15% + $0.50
  { maxExclusiveCents: 5_000_000, rateBp: 410, fixedCents: 50 }, //  < $50k   4.10% + $0.50
  { maxExclusiveCents: 10_000_000, rateBp: 405, fixedCents: 50 }, // < $100k  4.05% + $0.50
  { maxExclusiveCents: 50_000_000, rateBp: 400, fixedCents: 50 }, // < $500k  4.00% + $0.50
  { maxExclusiveCents: null, rateBp: 395, fixedCents: 53 }, //      >= $500k  3.95% + $0.53
] as const;

export type FeeBreakdown = {
  kind: PaymentKind;
  paymentMethod: PaymentMethod;
  /** The fee base. Tips are deliberately not part of it. */
  subtotalCents: number;
  /** Passed through to the merchant untouched by Lokala fees. */
  tipCents: number;
  customerFeeCents: number;
  merchantFeeCents: number;
  /** Stripe application_fee_amount = customer fee + merchant fee. */
  applicationFeeCents: number;
  /** What the customer's card is charged. */
  chargedCents: number;
  /** What the merchant receives. Zero for a gift purchase (no merchant). */
  merchantNetCents: number;
  currency: "usd";
  feePolicyVersion: string;
};

/**
 * Percentage-plus-fixed fee in exact integer cents.
 *
 * Half-cent products round half-up (Math.round), matching the display helper's
 * behavior so a customer is never charged a cent more than they were shown.
 */
function tieredFee(baseCents: number, rateBp: number, fixedCents: number): number {
  return Math.round((baseCents * rateBp) / 10_000) + fixedCents;
}

function assertAmount(label: string, value: number, min: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents.`);
  }
  if (value < min) {
    throw new Error(`${label} must be at least ${min} cents.`);
  }
  if (value > MAX_AMOUNT_CENTS) {
    throw new Error(`${label} exceeds the maximum supported amount.`);
  }
}

/** The tier a fee base falls into. Exported for tests and admin tooling. */
export function resolveCustomerTier(baseCents: number): CustomerTier {
  for (const tier of CUSTOMER_TIERS) {
    if (tier.maxExclusiveCents === null || baseCents < tier.maxExclusiveCents) {
      return tier;
    }
  }
  // Unreachable: the last tier has no upper bound.
  return CUSTOMER_TIERS[CUSTOMER_TIERS.length - 1]!;
}

/**
 * Policy version identifying the schedule that produced a breakdown, e.g.
 * "qr-card-v1". Kind and method are both encoded because each can be repriced
 * independently.
 */
export function feePolicyVersion(
  kind: PaymentKind,
  paymentMethod: PaymentMethod,
): string {
  const kindSlug = kind === "merchant_qr_payment" ? "qr" : "gift";
  return `${kindSlug}-${paymentMethod}-v1`;
}

/** Customer-side fee for a fee base, honoring the ACH discount. */
export function calculateCustomerFeeCents(
  baseCents: number,
  paymentMethod: PaymentMethod = "card",
): number {
  assertAmount("subtotalCents", baseCents, 1);
  const tier = resolveCustomerTier(baseCents);
  const rateBp =
    paymentMethod === "ach" ? Math.max(0, tier.rateBp - ACH_DISCOUNT_BP) : tier.rateBp;
  return tieredFee(baseCents, rateBp, tier.fixedCents);
}

/** Merchant-side fee charged when a business redeems Lokala credit (2.5%). */
export function calculateGiftRedemptionFeeCents(baseCents: number): number {
  assertAmount("baseCents", baseCents, 1);
  return Math.round((baseCents * GIFT_REDEMPTION_FEE_BP) / 10_000);
}

export type QuoteInput = {
  kind: PaymentKind;
  subtotalCents: number;
  /** Optional; always 0 for a gift purchase. */
  tipCents?: number;
  paymentMethod?: PaymentMethod;
};

/**
 * The single entry point callers should use. Returns the complete, immutable
 * fee breakdown for a payment. Derives every amount from the subtotal, tip,
 * kind, and method -- it never trusts a caller-supplied fee or total.
 */
export function quotePayment(input: QuoteInput): FeeBreakdown {
  const { kind } = input;
  const paymentMethod = input.paymentMethod ?? "card";
  const subtotalCents = input.subtotalCents;
  const tipCents = input.tipCents ?? 0;

  assertAmount("subtotalCents", subtotalCents, 1);
  assertAmount("tipCents", tipCents, 0);

  if (kind === "gift_certificate_purchase" && tipCents !== 0) {
    throw new Error("A gift certificate purchase cannot carry a tip.");
  }

  // Fee base excludes the tip, by policy.
  const customerFeeCents = calculateCustomerFeeCents(subtotalCents, paymentMethod);

  // Only a merchant QR payment has a merchant to charge.
  const merchantFeeCents =
    kind === "merchant_qr_payment"
      ? Math.round((subtotalCents * MERCHANT_QR_FEE_BP) / 10_000)
      : 0;

  const applicationFeeCents = customerFeeCents + merchantFeeCents;
  const chargedCents = subtotalCents + tipCents + customerFeeCents;
  const merchantNetCents =
    kind === "merchant_qr_payment" ? subtotalCents + tipCents - merchantFeeCents : 0;

  if (chargedCents > MAX_AMOUNT_CENTS) {
    throw new Error("Total charge exceeds the maximum supported amount.");
  }

  return {
    kind,
    paymentMethod,
    subtotalCents,
    tipCents,
    customerFeeCents,
    merchantFeeCents,
    applicationFeeCents,
    chargedCents,
    merchantNetCents,
    currency: "usd",
    feePolicyVersion: feePolicyVersion(kind, paymentMethod),
  };
}
