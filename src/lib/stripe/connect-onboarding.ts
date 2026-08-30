/**
 * Stripe Connect onboarding / login-link domain logic. SERVER-ONLY.
 *
 * Callers supply a Stripe client so tests can mock every Stripe method.
 * This module never reads environment secret values itself.
 */

import type Stripe from "stripe";

import { canManageMerchant, type MerchantRole } from "../auth/merchant.ts";
import {
  readinessPatchFromStripeAccount,
  type ConnectReadinessPatch,
} from "./connect-readiness.ts";

export const CONNECT_CLIENT_ERRORS = {
  unauthenticated: "Not authenticated.",
  forbidden: "Only business owners and admins can connect payouts.",
  staffDenied: "Staff can view payout status but cannot change Stripe setup.",
  modeMismatch:
    "Stripe is not in the same test or live mode as Lokala. Payout setup cannot continue until this is fixed.",
  recoveryRequired:
    "Stripe payout setup needs recovery before it can continue. Contact support.",
  transfersOnlyRejected:
    "Stripe did not accept a transfers-only Express account. Lokala does not enable card payments for restaurant payouts. Contact support.",
  notConfigured: "Payout setup is not configured.",
  noAccount: "Connect payouts before opening the Stripe dashboard.",
  generic: "Could not start Stripe onboarding. Please try again.",
  loginGeneric: "Could not open the Stripe dashboard. Please try again.",
  syncGeneric: "Could not refresh payout status. Please try again.",
} as const;

export type ConnectAdminRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type ConnectAccountSnapshot = {
  id: string;
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

export type ConnectOnboardingStripe = {
  accounts: {
    create: (
      params: Stripe.AccountCreateParams,
      options?: Stripe.RequestOptions,
    ) => Promise<ConnectAccountSnapshot>;
    retrieve: (id: string) => Promise<ConnectAccountSnapshot>;
    createLoginLink: (id: string) => Promise<{ url: string }>;
  };
  accountLinks: {
    create: (params: Stripe.AccountLinkCreateParams) => Promise<{ url: string }>;
  };
};

export type ConnectActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

export type ConnectReservation =
  | { outcome: "already_connected"; stripeAccountId: string }
  | { outcome: "needs_create"; idempotencyKey: string }
  | { outcome: "recovery_required" };

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function authorizeConnectMutation(
  userId: string | null | undefined,
  role: MerchantRole | null | undefined,
): ConnectActionResult<true> {
  if (!userId) {
    return { ok: false, status: 401, error: CONNECT_CLIENT_ERRORS.unauthenticated };
  }
  if (!role) {
    return { ok: false, status: 403, error: CONNECT_CLIENT_ERRORS.forbidden };
  }
  if (!canManageMerchant(role)) {
    return { ok: false, status: 403, error: CONNECT_CLIENT_ERRORS.staffDenied };
  }
  return { ok: true, value: true };
}

export function logConnectFailure(scope: string, code: string, err?: unknown): void {
  const stripeCode =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  const type = err instanceof Error ? err.name : typeof err;
  console.error(`[${scope}] ${code}`, { type, stripeCode });
}

export function isTransfersOnlyRejected(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err ?? "").toLowerCase();
  return (
    message.includes("card_payments") ||
    (message.includes("capability") && message.includes("transfers"))
  );
}

function clientErrorFromStripeCreate(err: unknown): ConnectActionResult<never> {
  if (isTransfersOnlyRejected(err)) {
    logConnectFailure("connect.onboard", "transfers_only_rejected");
    return {
      ok: false,
      status: 409,
      error: CONNECT_CLIENT_ERRORS.transfersOnlyRejected,
    };
  }
  logConnectFailure("connect.onboard", "stripe_create_failed");
  return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.generic };
}

async function rpcJson(
  admin: ConnectAdminRpc,
  fn: string,
  args?: Record<string, unknown>,
): Promise<JsonRecord | null> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    throw error;
  }
  return asRecord(data);
}

export async function readPlatformStripeLivemode(
  admin: ConnectAdminRpc,
): Promise<boolean> {
  const { data, error } = await admin.rpc("service_get_platform_stripe_livemode");
  if (error) {
    throw error;
  }
  const value = asBoolean(data);
  if (value === null) {
    throw new Error("platform livemode missing");
  }
  return value;
}

export async function parseReservation(
  admin: ConnectAdminRpc,
  merchantAccountId: string,
  livemode: boolean,
): Promise<ConnectReservation> {
  const row = await rpcJson(admin, "service_reserve_stripe_connect_account", {
    p_merchant_account_id: merchantAccountId,
    p_livemode: livemode,
  });
  const outcome = asString(row?.outcome);
  if (outcome === "already_connected") {
    const stripeAccountId = asString(row?.stripe_account_id);
    if (!stripeAccountId) {
      return { outcome: "recovery_required" };
    }
    return { outcome: "already_connected", stripeAccountId };
  }
  if (outcome === "needs_create") {
    const idempotencyKey = asString(row?.idempotency_key);
    if (!idempotencyKey) {
      return { outcome: "recovery_required" };
    }
    return { outcome: "needs_create", idempotencyKey };
  }
  return { outcome: "recovery_required" };
}

export function buildExpressAccountCreateParams(input: {
  merchantAccountId: string;
  livemode: boolean;
  displayName: string;
  supportEmail: string | null;
  websiteUrl: string | null;
  userEmail: string | null;
}): Stripe.AccountCreateParams {
  const email = input.supportEmail?.trim() || input.userEmail?.trim() || undefined;
  const url = input.websiteUrl?.trim() || undefined;
  const name = input.displayName.trim() || undefined;

  return {
    type: "express",
    ...(email ? { email } : {}),
    capabilities: {
      transfers: { requested: true },
    },
    metadata: {
      lokala_merchant_account_id: input.merchantAccountId,
      lokala_livemode: input.livemode ? "true" : "false",
    },
    ...(name || url
      ? {
          business_profile: {
            ...(name ? { name } : {}),
            ...(url ? { url } : {}),
          },
        }
      : {}),
  };
}

function finalizeArgs(
  merchantAccountId: string,
  livemode: boolean,
  stripeAccountId: string,
  patch: ConnectReadinessPatch,
): Record<string, unknown> {
  return {
    p_merchant_account_id: merchantAccountId,
    p_livemode: livemode,
    p_stripe_account_id: stripeAccountId,
    p_onboarding_status: patch.onboarding_status,
    p_charges_enabled: patch.charges_enabled,
    p_payouts_enabled: patch.payouts_enabled,
    p_transfers_enabled: patch.transfers_enabled,
    p_details_submitted: patch.details_submitted,
    p_disabled_reason: patch.disabled_reason,
    p_requirements_currently_due: patch.requirements_currently_due,
    p_requirements_past_due: patch.requirements_past_due,
    p_requirements_eventually_due: patch.requirements_eventually_due,
  };
}

export async function startConnectOnboarding(input: {
  stripe: ConnectOnboardingStripe;
  admin: ConnectAdminRpc;
  merchant: {
    id: string;
    display_name: string;
    support_email: string | null;
    website_url: string | null;
  };
  userEmail: string | null;
  platformLive: boolean;
  origin: string;
}): Promise<ConnectActionResult<{ url: string }>> {
  let platformConfigLive: boolean;
  try {
    platformConfigLive = await readPlatformStripeLivemode(input.admin);
  } catch (err) {
    logConnectFailure("connect.onboard", "platform_livemode_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.notConfigured };
  }

  if (platformConfigLive !== input.platformLive) {
    return { ok: false, status: 409, error: CONNECT_CLIENT_ERRORS.modeMismatch };
  }

  let reservation: ConnectReservation;
  try {
    reservation = await parseReservation(
      input.admin,
      input.merchant.id,
      input.platformLive,
    );
  } catch (err) {
    logConnectFailure("connect.onboard", "reserve_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.generic };
  }

  if (reservation.outcome === "recovery_required") {
    return { ok: false, status: 409, error: CONNECT_CLIENT_ERRORS.recoveryRequired };
  }

  let accountId: string;

  if (reservation.outcome === "already_connected") {
    accountId = reservation.stripeAccountId;
  } else {
    const createParams = buildExpressAccountCreateParams({
      merchantAccountId: input.merchant.id,
      livemode: input.platformLive,
      displayName: input.merchant.display_name,
      supportEmail: input.merchant.support_email,
      websiteUrl: input.merchant.website_url,
      userEmail: input.userEmail,
    });

    let created: ConnectAccountSnapshot;
    try {
      created = await input.stripe.accounts.create(createParams, {
        idempotencyKey: reservation.idempotencyKey,
      });
    } catch (err) {
      return clientErrorFromStripeCreate(err);
    }

    const stripeAccountId = created.id?.trim();
    if (!stripeAccountId) {
      logConnectFailure("connect.onboard", "create_missing_id");
      return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.generic };
    }

    const patch = readinessPatchFromStripeAccount(created, input.platformLive);
    try {
      await rpcJson(input.admin, "service_finalize_stripe_connected_account", {
        ...finalizeArgs(input.merchant.id, input.platformLive, stripeAccountId, patch),
      });
    } catch (err) {
      logConnectFailure("connect.onboard", "finalize_failed", err);
      return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.generic };
    }
    accountId = stripeAccountId;
  }

  try {
    const accountLink = await input.stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: `${input.origin}/business/payments/return`,
      refresh_url: `${input.origin}/business/payments`,
    });
    const url = accountLink.url?.trim();
    if (!url) {
      return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.generic };
    }
    return { ok: true, value: { url } };
  } catch (err) {
    logConnectFailure("connect.onboard", "account_link_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.generic };
  }
}

export async function readConnectedAccountId(
  admin: ConnectAdminRpc,
  merchantAccountId: string,
  livemode: boolean,
): Promise<string | null> {
  const row = await rpcJson(admin, "service_get_stripe_connected_account", {
    p_merchant_account_id: merchantAccountId,
    p_livemode: livemode,
  });
  return asString(row?.stripe_account_id);
}

export async function syncConnectedAccountFromStripe(input: {
  stripe: ConnectOnboardingStripe;
  admin: ConnectAdminRpc;
  merchantAccountId: string;
  platformLive: boolean;
}): Promise<ConnectActionResult<ConnectReadinessPatch | null>> {
  let accountId: string | null;
  try {
    accountId = await readConnectedAccountId(
      input.admin,
      input.merchantAccountId,
      input.platformLive,
    );
  } catch (err) {
    logConnectFailure("connect.return", "lookup_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.syncGeneric };
  }

  if (!accountId) {
    return { ok: true, value: null };
  }

  let account: ConnectAccountSnapshot;
  try {
    account = await input.stripe.accounts.retrieve(accountId);
  } catch (err) {
    logConnectFailure("connect.return", "retrieve_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.syncGeneric };
  }

  const patch = readinessPatchFromStripeAccount(account, input.platformLive);
  try {
    await rpcJson(input.admin, "service_sync_stripe_connected_account", {
      p_stripe_account_id: accountId,
      p_livemode: input.platformLive,
      p_onboarding_status: patch.onboarding_status,
      p_charges_enabled: patch.charges_enabled,
      p_payouts_enabled: patch.payouts_enabled,
      p_transfers_enabled: patch.transfers_enabled,
      p_details_submitted: patch.details_submitted,
      p_disabled_reason: patch.disabled_reason,
      p_requirements_currently_due: patch.requirements_currently_due,
      p_requirements_past_due: patch.requirements_past_due,
      p_requirements_eventually_due: patch.requirements_eventually_due,
    });
  } catch (err) {
    logConnectFailure("connect.return", "sync_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.syncGeneric };
  }

  return { ok: true, value: patch };
}

export async function createExpressLoginLink(input: {
  stripe: ConnectOnboardingStripe;
  admin: ConnectAdminRpc;
  merchantAccountId: string;
  platformLive: boolean;
}): Promise<ConnectActionResult<{ url: string }>> {
  let accountId: string | null;
  try {
    accountId = await readConnectedAccountId(
      input.admin,
      input.merchantAccountId,
      input.platformLive,
    );
  } catch (err) {
    logConnectFailure("connect.login", "lookup_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.loginGeneric };
  }

  if (!accountId) {
    return { ok: false, status: 409, error: CONNECT_CLIENT_ERRORS.noAccount };
  }

  try {
    const link = await input.stripe.accounts.createLoginLink(accountId);
    const url = link.url?.trim();
    if (!url) {
      return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.loginGeneric };
    }
    return { ok: true, value: { url } };
  } catch (err) {
    logConnectFailure("connect.login", "login_link_failed", err);
    return { ok: false, status: 500, error: CONNECT_CLIENT_ERRORS.loginGeneric };
  }
}

export function connectJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function payloadHasForbiddenFields(payload: unknown): boolean {
  const raw = JSON.stringify(payload);
  return (
    /acct_[A-Za-z0-9]+/.test(raw) ||
    /sk_(live|test)_/.test(raw) ||
    /whsec_/.test(raw) ||
    /idempotency/i.test(raw)
  );
}
