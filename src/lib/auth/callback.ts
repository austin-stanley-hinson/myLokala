import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

/**
 * Whether the user has any active `merchant_members` row (the authorization
 * source of truth). Inlined here — rather than importing the merchant helper —
 * so this module has no runtime cross-module import and stays directly unit
 * testable. RLS scopes the read to the authenticated caller.
 */
async function hasActiveMembership(
  supabase: TypedClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("merchant_members")
    .select("merchant_account_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

export const AUTH_CALLBACK_PATH = "/auth/callback";
const DEFAULT_NEXT = "/business";
const ONBOARDING_PATH = "/business/onboarding";

/**
 * Presentation-only query flag appended to the onboarding redirect after a
 * successful confirmation, so onboarding can show an "Email verified" notice.
 * It is NEVER trusted for authentication/authorization.
 */
export const EMAIL_VERIFIED_PARAM = "email_verified";

/** Whether an onboarding `email_verified` query value marks a fresh confirmation. */
export function isEmailVerifiedParam(
  value: string | string[] | undefined | null,
): boolean {
  return value === "1";
}

/**
 * Only allow internal, root-relative redirect targets. Rejects protocol-relative
 * (`//host`), scheme URLs, and backslash tricks so this can never become an open
 * redirect. Defaults business auth to the dashboard.
 */
export function safeNext(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\")
  ) {
    return DEFAULT_NEXT;
  }
  return next;
}

/**
 * The `emailRedirectTo` sent with sign-up so the confirmation link returns to
 * our own origin at `/auth/callback`, which then establishes the session and
 * routes by merchant membership. Kept as a single source of truth so signup and
 * the callback agree on the path.
 */
export function buildEmailRedirectTo(
  origin: string,
  next: string = DEFAULT_NEXT,
): string {
  return `${origin}${AUTH_CALLBACK_PATH}?next=${next}`;
}

export type AuthCallbackParams = {
  /** PKCE authorization code (OAuth / magic-link / PKCE email links). */
  code: string | null;
  /** Hashed OTP token (recommended email-confirmation / recovery links). */
  tokenHash: string | null;
  /** OTP type that accompanies `tokenHash`. */
  type: string | null;
  /** Error surfaced by GoTrue on the redirect (expired/invalid link, etc.). */
  error: string | null;
  /** Safe, root-relative destination for confirmed members (post-`safeNext`). */
  next: string;
};

const KNOWN_OTP_TYPES: readonly string[] = [
  "signup",
  "email",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
];

function toOtpType(type: string | null): EmailOtpType | null {
  return type && KNOWN_OTP_TYPES.includes(type)
    ? (type as EmailOtpType)
    : null;
}

/**
 * Resolve the Supabase email/OAuth callback to a root-relative redirect target.
 *
 * Establishes the session from whichever verification parameter is present:
 *   - `code`      → PKCE `exchangeCodeForSession` (OAuth, magic link, PKCE email)
 *   - `token_hash`→ `verifyOtp` (the resilient email-confirmation / recovery
 *                    link that does not depend on the PKCE verifier being in the
 *                    same browser that started sign-up)
 *
 * Then routes by merchant membership (the authorization source of truth):
 *   - active merchant member    → the safe `next` path (default `/business`)
 *   - authenticated non-member  → merchant onboarding
 *
 * Merchant creation never happens here (only on the onboarding page), so
 * callback retries can never create duplicate merchant accounts.
 */
export async function resolveAuthCallback(
  supabase: TypedClient,
  params: AuthCallbackParams,
): Promise<string> {
  // GoTrue redirected back with an explicit failure (e.g. expired/used link).
  if (params.error) {
    return "/login?error=auth_callback";
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return "/login?error=auth_callback";
    }
  } else if (params.tokenHash) {
    const type = toOtpType(params.type);
    if (!type) {
      return "/login?error=missing_code";
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type,
    });
    if (error) {
      return "/login?error=auth_callback";
    }
  } else {
    return "/login?error=missing_code";
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return "/login?error=no_session";
  }

  if (await hasActiveMembership(supabase, user.id)) {
    return params.next;
  }

  // A caller that requested a specific, non-default destination (e.g. a
  // customer confirming email to finish claiming a gift) is honored as-is —
  // this is a customer flow, not a merchant one, so onboarding would be
  // wrong. Only the default/unrequested case falls through to self-serve
  // merchant onboarding, exactly as before.
  if (params.next !== DEFAULT_NEXT) {
    return params.next;
  }

  // Authenticated but no merchant yet → self-serve onboarding. The
  // `email_verified=1` flag is presentation-only (it just lets onboarding show a
  // success notice); it is never trusted for auth/authorization. It is added
  // ONLY here, after a successful session exchange for a non-member — never on
  // direct visits, login routing, failed callbacks, or member redirects.
  return `${ONBOARDING_PATH}?${EMAIL_VERIFIED_PARAM}=1`;
}
