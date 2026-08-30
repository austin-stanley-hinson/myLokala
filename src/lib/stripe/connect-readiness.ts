/**
 * Connect readiness helpers. SERVER-ONLY.
 *
 * Lokala uses Stripe Connect as a merchant payout rail for later settlement
 * Transfers. QR redemption does not take a card. Readiness therefore keys off
 * transfers + payouts, never charges_enabled / card_payments.
 */

export type ConnectOnboardingStatus =
  | "not_started"
  | "pending"
  | "restricted"
  | "disabled"
  | "complete";

export type ConnectReadinessPatch = {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  transfers_enabled: boolean;
  details_submitted: boolean;
  onboarding_status: ConnectOnboardingStatus;
  livemode: boolean;
  disabled_reason: string | null;
  requirements_currently_due: string[];
  requirements_past_due: string[];
  requirements_eventually_due: string[];
};

export type ConnectReadinessInput = {
  details_submitted: boolean;
  payouts_enabled: boolean;
  transfers_enabled: boolean;
  currently_due: readonly string[];
  past_due: readonly string[];
  eventually_due?: readonly string[];
  disabled_reason: string | null;
};

function asStringArray(value: readonly string[] | string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** Cached onboarding_status from a Stripe Account snapshot. */
export function deriveConnectOnboardingStatus(
  input: ConnectReadinessInput,
): ConnectOnboardingStatus {
  if (input.disabled_reason) {
    return "disabled";
  }
  if (input.currently_due.length > 0 || input.past_due.length > 0) {
    return "restricted";
  }
  if (
    input.details_submitted &&
    input.payouts_enabled &&
    input.transfers_enabled
  ) {
    return "complete";
  }
  return "pending";
}

export function transfersCapabilityActive(
  capabilities: { transfers?: string | null } | null | undefined,
): boolean {
  return capabilities?.transfers === "active";
}

type StripeAccountSnapshot = {
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
  capabilities?: { transfers?: string | null } | null;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
    eventually_due?: string[] | null;
    disabled_reason?: string | null;
  } | null;
};

/**
 * Map a Stripe Account object into the columns we cache locally.
 *
 * Connected Account objects in this Stripe SDK do not expose livemode.
 * Pass event.livemode (webhook) or the platform key mode (return / onboard).
 */
export function readinessPatchFromStripeAccount(
  account: StripeAccountSnapshot,
  livemode: boolean,
): ConnectReadinessPatch {
  const currently_due = asStringArray(account.requirements?.currently_due);
  const past_due = asStringArray(account.requirements?.past_due);
  const eventually_due = asStringArray(account.requirements?.eventually_due);
  const disabled_reason = account.requirements?.disabled_reason?.trim() || null;
  const details_submitted = Boolean(account.details_submitted);
  const payouts_enabled = Boolean(account.payouts_enabled);
  const transfers_enabled = transfersCapabilityActive(account.capabilities);
  const charges_enabled = Boolean(account.charges_enabled);

  return {
    charges_enabled,
    payouts_enabled,
    transfers_enabled,
    details_submitted,
    disabled_reason,
    requirements_currently_due: currently_due,
    requirements_past_due: past_due,
    requirements_eventually_due: eventually_due,
    livemode,
    onboarding_status: deriveConnectOnboardingStatus({
      details_submitted,
      payouts_enabled,
      transfers_enabled,
      currently_due,
      past_due,
      eventually_due,
      disabled_reason,
    }),
  };
}

/**
 * Whether a cached connected account may be used with the current platform
 * Stripe mode (test vs live). New rows always store an explicit boolean.
 */
export function connectedAccountUsableInMode(
  accountLivemode: boolean | null | undefined,
  platformLive: boolean,
): boolean {
  if (accountLivemode === null || accountLivemode === undefined) {
    return false;
  }
  return accountLivemode === platformLive;
}

/** Exact settlement-readiness formula used by the database helper. */
export function isConnectReadyForSettlement(
  patch: ConnectReadinessPatch,
  platformLive: boolean,
): boolean {
  return (
    connectedAccountUsableInMode(patch.livemode, platformLive) &&
    patch.onboarding_status === "complete" &&
    patch.details_submitted &&
    patch.payouts_enabled &&
    patch.transfers_enabled &&
    patch.disabled_reason === null &&
    patch.requirements_currently_due.length === 0 &&
    patch.requirements_past_due.length === 0
  );
}
