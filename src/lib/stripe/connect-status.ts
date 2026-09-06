import {
  isActionableDisabledReason,
  isRequirementsCollectionReason,
  type ConnectOnboardingStatus,
} from "./connect-readiness.ts";

export type MerchantConnectStatus = {
  onboardingStatus: ConnectOnboardingStatus;
  hasConnectedAccount: boolean;
  payoutsEnabled: boolean;
  transfersEnabled: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  livemode: boolean;
  livemodeMatches: boolean;
  disabledReason: string | null;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsEventuallyDue: string[];
  readyForSettlement: boolean;
};

const STATUSES: readonly ConnectOnboardingStatus[] = [
  "not_started",
  "pending",
  "restricted",
  "disabled",
  "complete",
];

function asStatus(value: unknown): ConnectOnboardingStatus {
  return typeof value === "string" &&
    (STATUSES as readonly string[]).includes(value)
    ? (value as ConnectOnboardingStatus)
    : "not_started";
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseMerchantConnectStatus(
  value: unknown,
): MerchantConnectStatus {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    onboardingStatus: asStatus(row.onboarding_status),
    hasConnectedAccount: asBoolean(row.has_connected_account),
    payoutsEnabled: asBoolean(row.payouts_enabled),
    transfersEnabled: asBoolean(row.transfers_enabled),
    detailsSubmitted: asBoolean(row.details_submitted),
    chargesEnabled: asBoolean(row.charges_enabled),
    livemode: asBoolean(row.livemode),
    livemodeMatches: row.livemode_matches !== false,
    disabledReason:
      typeof row.disabled_reason === "string" && row.disabled_reason.length > 0
        ? row.disabled_reason
        : null,
    requirementsCurrentlyDue: asStringArray(row.requirements_currently_due),
    requirementsPastDue: asStringArray(row.requirements_past_due),
    requirementsEventuallyDue: asStringArray(row.requirements_eventually_due),
    readyForSettlement: asBoolean(row.ready_for_settlement),
  };
}

export const EMPTY_CONNECT_STATUS: MerchantConnectStatus = parseMerchantConnectStatus(
  null,
);

export type ConnectPayoutTone =
  | "ready"
  | "incomplete"
  | "restricted"
  | "pending"
  | "disabled"
  | "not_started";

export type ConnectPayoutView = {
  tone: ConnectPayoutTone;
  pillLabel: string;
  description: string;
  showOnboard: boolean;
  showLogin: boolean;
  onboardLabel: "Start payout setup" | "Continue Stripe setup";
};

export function isEligibleForExpressLoginLink(
  status: MerchantConnectStatus,
): boolean {
  return status.hasConnectedAccount && status.detailsSubmitted;
}

/**
 * Card copy and actions. Uses cached Stripe fields rather than JSX conditionals
 * on raw requirement lists. A stale `disabled` row with a `requirements.*`
 * reason is treated as incomplete/restricted, not banned.
 */
export function connectPayoutView(
  status: MerchantConnectStatus,
  canManage: boolean,
): ConnectPayoutView {
  if (status.readyForSettlement) {
    return {
      tone: "ready",
      pillLabel: "Payout ready",
      description:
        "Payouts are ready. When customers redeem Lokala balance at your QR code, Lokala will settle that amount to this Stripe account. Customers do not pay by card at the restaurant.",
      showOnboard: false,
      showLogin: canManage && isEligibleForExpressLoginLink(status),
      onboardLabel: "Continue Stripe setup",
    };
  }

  if (!status.hasConnectedAccount) {
    return {
      tone: "not_started",
      pillLabel: "Not connected",
      description: canManage
        ? "Connect Stripe so Lokala can settle redeemed gift balance to your restaurant. Customers buy Lokala balance on the platform and redeem it at your QR code — you do not take a card at the counter."
        : "An owner or admin needs to connect Stripe before Lokala can settle redeemed gift balance to this restaurant.",
      showOnboard: canManage,
      showLogin: false,
      onboardLabel: "Start payout setup",
    };
  }

  const actuallyDisabled =
    isActionableDisabledReason(status.disabledReason) ||
    (status.onboardingStatus === "disabled" &&
      !isRequirementsCollectionReason(status.disabledReason) &&
      status.disabledReason !== "under_review");

  if (actuallyDisabled) {
    return {
      tone: "disabled",
      pillLabel: "Disabled",
      description: canManage
        ? "Stripe has disabled payouts for this account. Continue setup or contact support if the issue persists. Lokala cannot settle redemptions until this is fixed."
        : "Stripe has disabled payouts for this account. An owner or admin needs to resolve this before Lokala can settle redemptions.",
      showOnboard: canManage,
      showLogin: canManage && isEligibleForExpressLoginLink(status),
      onboardLabel: "Continue Stripe setup",
    };
  }

  if (!status.detailsSubmitted) {
    return {
      tone: "incomplete",
      pillLabel: "Setup incomplete",
      description: canManage
        ? "Complete the required business and identity information to enable payouts."
        : "An owner or admin needs to finish Stripe setup before payouts can start.",
      showOnboard: canManage,
      showLogin: false,
      onboardLabel: "Continue Stripe setup",
    };
  }

  const needsMoreInfo =
    status.onboardingStatus === "restricted" ||
    status.requirementsCurrentlyDue.length > 0 ||
    status.requirementsPastDue.length > 0;

  if (needsMoreInfo) {
    return {
      tone: "restricted",
      pillLabel: "Action needed",
      description: canManage
        ? "Stripe needs more information before Lokala can settle redeemed balance to your bank. Continue setup to finish verification."
        : "Stripe still needs information from an owner or admin before payouts can start.",
      showOnboard: canManage,
      showLogin: canManage && isEligibleForExpressLoginLink(status),
      onboardLabel: "Continue Stripe setup",
    };
  }

  return {
    tone: "pending",
    pillLabel: "In review",
    description: canManage
      ? "Stripe is still reviewing your payout account. Continue setup if any details are still required. Returning from Stripe does not always mean setup is finished."
      : "Stripe is still reviewing this payout account. Returning from Stripe does not always mean setup is finished.",
    showOnboard: canManage,
    showLogin: canManage && isEligibleForExpressLoginLink(status),
    onboardLabel: "Continue Stripe setup",
  };
}
