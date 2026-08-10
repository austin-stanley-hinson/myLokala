/**
 * Connect readiness helpers. SERVER-ONLY.
 *
 * Shared by the hosted-onboarding return page and the Connect account.updated
 * webhook so both derive onboarding_status the same way.
 */

export type ConnectOnboardingStatus =
  | "not_started"
  | "pending"
  | "complete"
  | "restricted";

export type ConnectReadinessPatch = {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_status: ConnectOnboardingStatus;
  livemode: boolean;
};

type ReadinessInput = {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  currently_due: readonly string[];
  past_due: readonly string[];
};

/**
 * Priority matches the historical return-page logic:
 * complete → restricted (outstanding requirements) → pending.
 */
export function deriveConnectOnboardingStatus(
  input: ReadinessInput,
): ConnectOnboardingStatus {
  if (input.charges_enabled && input.payouts_enabled) {
    return "complete";
  }
  if (input.currently_due.length > 0 || input.past_due.length > 0) {
    return "restricted";
  }
  return "pending";
}

/** Map a Stripe Account object into the columns we cache locally. */
export function readinessPatchFromStripeAccount(
  account: {
    charges_enabled?: boolean | null;
    payouts_enabled?: boolean | null;
    details_submitted?: boolean | null;
    requirements?: {
      currently_due?: string[] | null;
      past_due?: string[] | null;
    } | null;
  },
  /**
   * Connected Account objects in this Stripe SDK do not expose livemode.
   * Pass event.livemode (webhook) or the platform key mode (return / onboard).
   */
  livemode: boolean,
): ConnectReadinessPatch {
  const charges_enabled = Boolean(account.charges_enabled);
  const payouts_enabled = Boolean(account.payouts_enabled);
  const details_submitted = Boolean(account.details_submitted);
  const currently_due = account.requirements?.currently_due ?? [];
  const past_due = account.requirements?.past_due ?? [];

  return {
    charges_enabled,
    payouts_enabled,
    details_submitted,
    onboarding_status: deriveConnectOnboardingStatus({
      charges_enabled,
      payouts_enabled,
      details_submitted,
      currently_due,
      past_due,
    }),
    livemode,
  };
}

/**
 * Whether a cached connected account may be used with the current platform
 * Stripe mode (test vs live).
 *
 * Legacy rows (`livemode` null) were created during the test-mode rollout and
 * are only usable while the platform key is still test. Live keys require an
 * explicit live connected account.
 */
export function connectedAccountUsableInMode(
  accountLivemode: boolean | null | undefined,
  platformLive: boolean,
): boolean {
  if (accountLivemode === null || accountLivemode === undefined) {
    return !platformLive;
  }
  return accountLivemode === platformLive;
}
