/**
 * Lokala gift-card fee model (Colin’s spreadsheet).
 *
 * Consumer fee is added at purchase. Business fee is estimated at redemption.
 * No payment processing is performed here — display/math helpers only.
 */

export type GiftCardPaymentMethod = "card" | "bank";

export type ConsumerFeeOptions = {
  /** Defaults to "card". Bank is 1.5 percentage points lower when selected. */
  paymentMethod?: GiftCardPaymentMethod;
};

type ConsumerTier = {
  /** Exclusive upper bound (amount < maxExclusive). null = no upper bound. */
  maxExclusive: number | null;
  rate: number;
  fixed: number;
};

/** Card/default consumer tiers: rate + fixed fee. */
const CONSUMER_CARD_TIERS: ConsumerTier[] = [
  { maxExclusive: 25, rate: 0.075, fixed: 0.5 },
  { maxExclusive: 50, rate: 0.07, fixed: 0.5 },
  { maxExclusive: 75, rate: 0.055, fixed: 0.5 },
  { maxExclusive: 100, rate: 0.05, fixed: 0.5 },
  { maxExclusive: 200, rate: 0.0475, fixed: 0.5 },
  { maxExclusive: 300, rate: 0.0445, fixed: 0.5 },
  { maxExclusive: 500, rate: 0.0425, fixed: 0.5 },
  { maxExclusive: 5_000, rate: 0.0415, fixed: 0.5 },
  { maxExclusive: 50_000, rate: 0.041, fixed: 0.5 },
  { maxExclusive: 100_000, rate: 0.0405, fixed: 0.5 },
  { maxExclusive: 500_000, rate: 0.04, fixed: 0.5 },
  { maxExclusive: null, rate: 0.0395, fixed: 0.53 },
];

/** Flat business-side fee at redemption. */
export const BUSINESS_REDEMPTION_FEE_RATE = 0.025;

/** Bank/direct transfer is 1.5 percentage points lower for consumers. */
const BANK_RATE_DISCOUNT = 0.015;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resolveConsumerTier(paymentMethod: GiftCardPaymentMethod): ConsumerTier[] {
  if (paymentMethod === "bank") {
    return CONSUMER_CARD_TIERS.map((tier) => ({
      ...tier,
      rate: Math.max(0, tier.rate - BANK_RATE_DISCOUNT),
    }));
  }
  return CONSUMER_CARD_TIERS;
}

function findConsumerTier(
  amount: number,
  paymentMethod: GiftCardPaymentMethod,
): ConsumerTier {
  const tiers = resolveConsumerTier(paymentMethod);
  for (const tier of tiers) {
    if (tier.maxExclusive === null || amount < tier.maxExclusive) {
      return tier;
    }
  }
  return tiers[tiers.length - 1]!;
}

/**
 * Consumer processing fee charged when purchasing a gift card.
 * Returns 0 for non-positive amounts.
 */
export function calculateConsumerGiftCardFee(
  amount: number,
  options: ConsumerFeeOptions = {},
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const paymentMethod = options.paymentMethod ?? "card";
  const tier = findConsumerTier(amount, paymentMethod);
  return roundMoney(amount * tier.rate + tier.fixed);
}

/**
 * Business-side fee estimate at redemption (2.50% flat).
 * Display-only until redemption/payouts are wired.
 */
export function calculateBusinessRedemptionFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return roundMoney(amount * BUSINESS_REDEMPTION_FEE_RATE);
}

export type GiftCardTotalBreakdown = {
  amount: number;
  consumerFee: number;
  total: number;
  paymentMethod: GiftCardPaymentMethod;
};

/** Gift amount + consumer processing fee. */
export function calculateGiftCardTotal(
  amount: number,
  options: ConsumerFeeOptions = {},
): GiftCardTotalBreakdown {
  const paymentMethod = options.paymentMethod ?? "card";
  const safeAmount =
    Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
  const consumerFee = calculateConsumerGiftCardFee(safeAmount, {
    paymentMethod,
  });
  return {
    amount: safeAmount,
    consumerFee,
    total: roundMoney(safeAmount + consumerFee),
    paymentMethod,
  };
}
