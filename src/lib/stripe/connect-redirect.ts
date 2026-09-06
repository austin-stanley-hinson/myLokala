/**
 * Browser-safe Stripe Connect redirect checks.
 *
 * Account Link URLs may include `acct_...` in the path. That is not a leaked
 * secret and must not block the redirect. Secrets (`sk_*`, `whsec_`) still are.
 */

const ALLOWED_HOSTS = new Set(["connect.stripe.com"]);

const RESPONSE_SECRETS = /sk_(live|test)_|whsec_/;

export function isAllowedStripeConnectRedirectUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
}

export function connectRedirectResponseHasSecrets(payload: unknown): boolean {
  try {
    return RESPONSE_SECRETS.test(JSON.stringify(payload));
  } catch {
    return true;
  }
}

export function parseConnectRedirectResponse(
  payload: unknown,
  httpOk: boolean,
): { ok: true; url: string } | { ok: false; error: string } {
  const fallback = "Could not continue Stripe setup. Please try again.";
  if (connectRedirectResponseHasSecrets(payload)) {
    return { ok: false, error: fallback };
  }
  const row =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  if (!httpOk) {
    return {
      ok: false,
      error: typeof row?.error === "string" && row.error.length > 0
        ? row.error
        : fallback,
    };
  }
  const url = typeof row?.url === "string" ? row.url.trim() : "";
  if (!url || !isAllowedStripeConnectRedirectUrl(url)) {
    return { ok: false, error: fallback };
  }
  return { ok: true, url };
}
