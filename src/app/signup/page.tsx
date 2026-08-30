"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createTypedClient } from "@/lib/supabase/client";
import { isActiveMerchantMember } from "@/lib/auth/merchant";
import { buildEmailRedirectTo } from "@/lib/auth/callback";
import {
  buildAuthDiagnostic,
  buildResendSignupArgs,
  getSignupErrorMessage,
  isEmailDeliveryFailure,
} from "@/lib/auth/signup-errors";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Show the "resend confirmation" affordance after a delivery failure (the
  // account may already exist), or after a normal confirmation-required signup.
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);

  // An already-signed-in merchant member should go straight to their dashboard.
  useEffect(() => {
    const supabase = createTypedClient();
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      if (await isActiveMerchantMember(supabase, user.id)) {
        if (!cancelled) router.replace("/business");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Reset only feedback — the entered field values are controlled state and
    // are always preserved across a failed attempt.
    setError(null);
    setSuccess(null);
    setResendError(null);
    setResendSuccess(null);
    setCanResend(false);
    setLoading(true);

    try {
      const supabase = createTypedClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // After confirming their email, the callback routes them into
          // merchant onboarding (or the dashboard if they already have one).
          emailRedirectTo: buildEmailRedirectTo(window.location.origin),
          // Only safe, non-authorization data. `display_name` is consumed by the
          // `handle_new_user` trigger; `pending_business_name` just pre-fills the
          // onboarding form. NO account-type / role / merchant claims here — the
          // database never trusts metadata for authorization.
          data: {
            display_name: fullName.trim(),
            pending_business_name: businessName.trim(),
          },
        },
      });

      if (signUpError) {
        // Never treat a delivery 500 as success and never create a merchant
        // here. Surface Supabase's own message (or the delivery-failure copy),
        // and offer a resend. Dev-only, secret-free diagnostic.
        if (process.env.NODE_ENV !== "production") {
          console.error("signup_error", buildAuthDiagnostic(signUpError));
        }
        setError(getSignupErrorMessage(signUpError));
        // A delivery failure may mean the account already exists → resend is the
        // right recovery. Ordinary validation errors don't get a resend prompt.
        setCanResend(isEmailDeliveryFailure(signUpError));
        return;
      }

      // When email confirmation is disabled, sign-up returns an active session;
      // send them to onboarding to create their merchant account.
      if (data.session && data.user) {
        router.replace("/business/onboarding");
        router.refresh();
        return;
      }

      // Otherwise confirmation is required; onboarding happens after they return
      // through /auth/callback.
      setCanResend(true);
      setSuccess(
        "Check your email to confirm your account. After confirming, you'll set up your business.",
      );
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("signup_error", buildAuthDiagnostic(err as never));
      }
      setError(getSignupErrorMessage(err as never));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendLoading) {
      return;
    }
    setResendError(null);
    setResendSuccess(null);
    setResendLoading(true);

    try {
      const supabase = createTypedClient();
      const { error: resendErr } = await supabase.auth.resend(
        buildResendSignupArgs(
          email,
          buildEmailRedirectTo(window.location.origin),
        ),
      );

      if (resendErr) {
        if (process.env.NODE_ENV !== "production") {
          console.error("signup_resend_error", buildAuthDiagnostic(resendErr));
        }
        setResendError(getSignupErrorMessage(resendErr));
        return;
      }

      // Deliberately does not claim the email was received/delivered, and does
      // not confirm whether the address belongs to an account.
      setResendSuccess(
        "If your account still needs confirmation, a new confirmation email is on its way. Please check your inbox.",
      );
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("signup_resend_error", buildAuthDiagnostic(err as never));
      }
      setResendError(getSignupErrorMessage(err as never));
    } finally {
      setResendLoading(false);
    }
  }

  // Only offer resend once we have an email to send to.
  const showResend = canResend && email.trim().length > 0;

  const fieldClass =
    "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        List your business on Lokala
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create an account to manage your business on Lokala. After you confirm
        your email, you&apos;ll set up your business profile. Shopping for local
        deals? Customers browse and pay in the Lokala mobile app.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-sm font-medium">
            Your name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="businessName" className="text-sm font-medium">
            Business name
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            autoComplete="organization"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={fieldClass}
          />
          <p className="text-xs text-muted-foreground">
            You can add address, phone, and other details when you set up your
            business after confirming your email.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {success ? (
          <p
            role="status"
            className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
          >
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create business account"}
        </button>

        {showResend ? (
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-input bg-muted/30 px-3 py-3">
            <p className="text-xs text-muted-foreground">
              Didn&apos;t get the confirmation email? You can request a new one.
            </p>
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resendLoading}
              className="self-start rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resendLoading ? "Resending…" : "Resend confirmation email"}
            </button>

            {resendError ? (
              <p
                role="alert"
                className="text-sm text-destructive"
              >
                {resendError}
              </p>
            ) : null}

            {resendSuccess ? (
              <p
                role="status"
                className="text-sm text-emerald-800 dark:text-emerald-200"
              >
                {resendSuccess}
              </p>
            ) : null}
          </div>
        ) : null}
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have a business account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Business sign in
        </Link>
      </p>
    </div>
  );
}
