import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { createTypedClient } from "@/lib/supabase/server";
import { getActiveMembership } from "@/lib/auth/merchant";
import { EMAIL_VERIFIED_PARAM, isEmailVerifiedParam } from "@/lib/auth/callback";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

/**
 * Post-confirmation merchant onboarding.
 *
 * Guard (idempotency layer 1): a signed-out visitor goes to `/login`; a user who
 * already has an active membership is redirected to the dashboard so this page
 * can never create a second merchant on a refresh, back-navigation, or callback
 * retry. The `create_merchant_account` RPC (invoked by the Server Action) is the
 * only merchant-creation path.
 */
export default async function MerchantOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect("/login");
  }

  // Presentation-only: the callback appends `email_verified=1` after a
  // successful confirmation. It gates NOTHING — auth/authorization below still
  // depend solely on the Supabase session and `merchant_members`.
  const params = await searchParams;
  const emailVerified = isEmailVerifiedParam(params[EMAIL_VERIFIED_PARAM]);

  const supabase = await createTypedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membership = await getActiveMembership(supabase, user.id);
  if (membership) {
    redirect("/business");
  }

  const pendingBusinessName =
    (user.user_metadata?.pending_business_name as string | undefined) ?? "";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      {emailVerified ? (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 px-4 py-3"
        >
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-emerald-600"
            aria-hidden
          />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Email verified
            </p>
            <p className="text-sm text-emerald-800/90 dark:text-emerald-200/90">
              Your Lokala account is ready. Create your business profile to
              continue to the merchant dashboard.
            </p>
          </div>
        </div>
      ) : null}

      <h1 className="text-2xl font-semibold tracking-tight">
        Set up your business
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tell us about your business to finish creating your Lokala merchant
        account. You can update these details later.
      </p>

      <OnboardingForm initialBusinessName={pendingBusinessName} />
    </div>
  );
}
