"use client";

import { useState, type FormEvent } from "react";

import { createTypedClient } from "@/lib/supabase/client";
import { buildEmailRedirectTo } from "@/lib/auth/callback";

const fieldClass =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Inline customer login/signup, shared by any customer-facing (non-merchant)
 * flow that needs a signed-in user before continuing -- e.g. the gift-claim
 * page and the buy-balance page. Deliberately separate from the existing
 * /login and /signup pages, which are business-only (hardcoded to route a
 * confirmed non-member into merchant onboarding) and have no "return to X"
 * concept for a customer flow.
 *
 * On sign-in, calls onAuthenticated() immediately (a password sign-in
 * establishes a session synchronously, no redirect round-trip). On sign-up,
 * if email confirmation is required, shows a "check your email, then come
 * back" notice instead -- confirming routes back to `returnPath` via
 * resolveAuthCallback's non-default-next branch (see lib/auth/callback.ts).
 */
export function CustomerAuthPanel({
  returnPath,
  onAuthenticated,
}: {
  /** Root-relative path to return to after email confirmation. */
  returnPath: string;
  onAuthenticated: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createTypedClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createTypedClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: buildEmailRedirectTo(window.location.origin, returnPath),
          data: { display_name: fullName.trim() },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        onAuthenticated();
        return;
      }
      setCheckEmail(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <p
        role="status"
        className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
      >
        Check your email to confirm your account, then come back to this page
        to continue.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-2 rounded-full bg-lokala-cream-light p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded-full px-4 py-2 transition ${mode === "login" ? "bg-white shadow-lokala-soft" : "text-lokala-muted"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-full px-4 py-2 transition ${mode === "signup" ? "bg-white shadow-lokala-soft" : "text-lokala-muted"}`}
        >
          Create account
        </button>
      </div>

      <form
        onSubmit={(e) => void (mode === "login" ? handleLogin(e) : handleSignup(e))}
        className="mt-6 flex flex-col gap-4"
      >
        {mode === "signup" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ca-fullName" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="ca-fullName"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={fieldClass}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ca-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="ca-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ca-password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="ca-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 6 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-full bg-lokala-green px-4 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
