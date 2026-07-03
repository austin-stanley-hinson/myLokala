import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner } from "@/lib/auth/business-profile";
import { BusinessDealsManager } from "@/components/business/business-deals-manager";
import { EditableBusinessProfile } from "@/components/business/editable-business-profile";
import { StripeConnectCard } from "@/components/business/stripe-connect-card";
import { DEAL_OWNER_COLUMNS, type Deal } from "@/types/deal";

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

  // Customers must never reach the business dashboard.
  if (!isBusinessOwner(user)) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, account_type, business_name, business_address, business_phone, business_website",
    )
    .eq("id", user.id)
    .maybeSingle<BusinessProfile>();

  if (
    profile &&
    profile.account_type &&
    profile.account_type !== "business_owner"
  ) {
    redirect("/");
  }

  const { data: dealRows } = await supabase
    .from("deals")
    .select(DEAL_OWNER_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const { data: paymentAccount } = await supabase
    .from("business_payment_accounts")
    .select("onboarding_status, charges_enabled, payouts_enabled")
    .eq("owner_id", user.id)
    .maybeSingle<PaymentAccount>();

  const deals = (dealRows ?? []) as Deal[];
  const activeCount = deals.filter((deal) => deal.is_active).length;
  const inactiveCount = deals.length - activeCount;

  const ownerName =
    profile?.full_name ?? (user.user_metadata?.full_name as string | undefined);
  const businessName =
    profile?.business_name ??
    (user.user_metadata?.business_name as string | undefined) ??
    "Your business";

  const stats = [
    { label: "Total deals", value: deals.length },
    { label: "Active", value: activeCount },
    { label: "Inactive", value: inactiveCount },
  ];

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

      <BusinessDealsManager
        initialDeals={deals}
        ownerId={user.id}
        defaultBusinessName={profile?.business_name ?? null}
      />

      <section id="activity" className="scroll-mt-24">
        <h2 className="text-lg font-extrabold text-lokala-brown-dark">
          Activity
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-lokala-border bg-white p-5 shadow-lokala-card"
            >
              <dt className="text-xs font-bold uppercase tracking-wide text-lokala-muted">
                {stat.label}
              </dt>
              <dd className="mt-1 text-3xl font-extrabold text-lokala-green-dark">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
