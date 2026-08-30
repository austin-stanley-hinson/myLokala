import { redirect } from "next/navigation";

import { createTypedClient } from "@/lib/supabase/server";
import { getActiveMembership } from "@/lib/auth/merchant";
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
export default async function MerchantOnboardingPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect("/login");
  }

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
