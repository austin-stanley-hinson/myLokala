import type { ConnectOnboardingStatus } from "./connect-readiness.ts";

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
