/**
 * Pure helpers for interpreting Supabase Auth sign-up / resend failures.
 *
 * These never touch the password, keys, tokens, confirmation URLs, or SMTP
 * credentials — they only read the safe, non-secret fields of an `AuthError`
 * (`message`, `code`, `status`). Kept dependency-free so the sign-up page's
 * failure handling is directly unit-testable.
 */

/** The safe subset of a Supabase `AuthError` we ever read or surface. */
export type AuthErrorLike = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
};

/** Structured, secret-free diagnostic safe to log in development only. */
export type AuthDiagnostic = {
  message: string;
  code: string | null;
  status: number | null;
};

export const EMAIL_DELIVERY_MESSAGE =
  "Lokala could not send the confirmation email. Your account may already have been created. Please try resending the confirmation email after email delivery is restored.";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * A confirmation-email delivery failure (e.g. SMTP down). GoTrue surfaces this
 * as an HTTP 500 with code `unexpected_failure` and/or a message about sending
 * the confirmation email — the account may already exist, so this is distinct
 * from an ordinary validation error.
 */
export function isEmailDeliveryFailure(
  error: AuthErrorLike | null | undefined,
): boolean {
  if (!error) {
    return false;
  }
  if (error.status === 500) {
    return true;
  }
  if (error.code === "unexpected_failure") {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("sending confirmation email") ||
    message.includes("error sending confirmation")
  );
}

/**
 * User-facing copy for a sign-up / resend failure. Email-delivery failures get
 * the dedicated explanation; every other error preserves Supabase's own
 * (informative) message rather than flattening it to a generic string.
 */
export function getSignupErrorMessage(
  error: AuthErrorLike | null | undefined,
): string {
  if (!error) {
    return GENERIC_MESSAGE;
  }
  if (isEmailDeliveryFailure(error)) {
    return EMAIL_DELIVERY_MESSAGE;
  }
  const message = error.message?.trim();
  return message ? message : GENERIC_MESSAGE;
}

/**
 * The safe, structured diagnostic for development logging. Only ever contains
 * `message`, `code`, and `status` — never the password or any secret.
 */
export function buildAuthDiagnostic(
  error: AuthErrorLike | null | undefined,
): AuthDiagnostic {
  return {
    message: error?.message ?? "",
    code: error?.code ?? null,
    status: error?.status ?? null,
  };
}

/** Arguments for `supabase.auth.resend` when re-sending a sign-up confirmation. */
export type ResendSignupArgs = {
  type: "signup";
  email: string;
  options: { emailRedirectTo: string };
};

/**
 * Build the `supabase.auth.resend` payload for a sign-up confirmation. The
 * `emailRedirectTo` is supplied by the caller (via `buildEmailRedirectTo`) so
 * this helper stays free of any browser/`window` or module dependency.
 */
export function buildResendSignupArgs(
  email: string,
  emailRedirectTo: string,
): ResendSignupArgs {
  return {
    type: "signup",
    email,
    options: { emailRedirectTo },
  };
}
