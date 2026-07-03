"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  BUSINESS_ACCOUNT_TYPE,
  ensureBusinessProfile,
  resolveBusinessOwner,
} from "@/lib/auth/business-profile";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // An already-signed-in business owner should go straight to their dashboard.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      if (await resolveBusinessOwner(supabase, user)) {
        if (!cancelled) router.replace("/business");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            account_type: BUSINESS_ACCOUNT_TYPE,
            business_name: businessName.trim(),
            business_address: businessAddress.trim(),
            business_phone: businessPhone.trim(),
            business_website: businessWebsite.trim(),
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // When email confirmation is disabled, sign-up returns an active session.
      // Create the business profile row now and head straight to the dashboard.
      if (data.session && data.user) {
        const { error: profileError } = await ensureBusinessProfile(
          supabase,
          data.user,
        );
        if (profileError) {
          setError(profileError.message);
          return;
        }

        router.replace("/business");
        router.refresh();
        return;
      }

      // Otherwise confirmation is required; the profile is written on first
      // sign-in once a session exists.
      setSuccess(
        "Business account created. Check your email to confirm it, then sign in.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        List your business on Lokala
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create a business account to publish deals and reach local customers.
        Customers browse and redeem deals in the Lokala mobile app.
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
        </div>

        <details className="rounded-lg border border-input bg-background/50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Add business details (optional)
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="businessAddress" className="text-sm font-medium">
                Business address
              </label>
              <input
                id="businessAddress"
                name="businessAddress"
                type="text"
                autoComplete="street-address"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="businessPhone" className="text-sm font-medium">
                Business phone
              </label>
              <input
                id="businessPhone"
                name="businessPhone"
                type="tel"
                autoComplete="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="businessWebsite" className="text-sm font-medium">
                Business website
              </label>
              <input
                id="businessWebsite"
                name="businessWebsite"
                type="url"
                autoComplete="url"
                placeholder="https://"
                value={businessWebsite}
                onChange={(e) => setBusinessWebsite(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
        </details>

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
