import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  BUSINESS_ACCOUNT_TYPE,
  isBusinessOwner,
} from "@/lib/auth/business-profile";
import { EditableBusinessProfile } from "@/components/business/editable-business-profile";
import { GiftCertificatesSection } from "@/components/business/gift-certificates-section";
import { StripeConnectCard } from "@/components/business/stripe-connect-card";

export const dynamic = "force-dynamic";

type BusinessProfile = {
  full_name: string | null;
  account_type: string | null;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_website: string | null;
};

type PaymentAccount = {
  onboarding_status: string | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
};

export default async function BusinessHomePage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, account_type, business_name, business_address, business_phone, business_website",
    )
    .eq("id", user.id)
    .maybeSingle<BusinessProfile>();

  // Customers must never reach the business dashboard. The profiles table is
  // the source of truth for account_type; fall back to auth metadata only when
  // no profile account_type exists yet (e.g. first sign-in).
  const isOwner = profile?.account_type
    ? profile.account_type === BUSINESS_ACCOUNT_TYPE
    : isBusinessOwner(user);

  if (!isOwner) {
    redirect("/");
  }

  const { data: paymentAccount } = await supabase
    .from("business_payment_accounts")
    .select("onboarding_status, charges_enabled, payouts_enabled")
    .eq("owner_id", user.id)
    .maybeSingle<PaymentAccount>();

  const ownerName =
    profile?.full_name ?? (user.user_metadata?.full_name as string | undefined);
  const businessName =
    profile?.business_name ??
    (user.user_metadata?.business_name as string | undefined) ??
    "Your business";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Business dashboard
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Welcome{ownerName ? `, ${ownerName}` : ""}.
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Managing{" "}
          <span className="font-bold text-lokala-brown-dark">
            {businessName}
          </span>{" "}
          on Lokala.
        </p>
      </header>

      <EditableBusinessProfile
        initial={{
          business_name: profile?.business_name ?? null,
          business_address: profile?.business_address ?? null,
          business_phone: profile?.business_phone ?? null,
          business_website: profile?.business_website ?? null,
        }}
      />

      <StripeConnectCard
        onboardingStatus={paymentAccount?.onboarding_status ?? null}
        chargesEnabled={Boolean(paymentAccount?.charges_enabled)}
        payoutsEnabled={Boolean(paymentAccount?.payouts_enabled)}
      />

      <GiftCertificatesSection />
    </div>
  );
}
