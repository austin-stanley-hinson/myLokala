import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner } from "@/lib/auth/business-profile";

export const dynamic = "force-dynamic";

type BusinessProfile = {
  full_name: string | null;
  account_type: string | null;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_website: string | null;
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

  // A business owner whose profile row hasn't been confirmed as a business
  // account yet is sent back to sign-in to complete the sync.
  if (profile && profile.account_type && profile.account_type !== "business_owner") {
    redirect("/");
  }

  const businessName =
    profile?.business_name ??
    (user.user_metadata?.business_name as string | undefined) ??
    "Your business";
  const ownerName =
    profile?.full_name ?? (user.user_metadata?.full_name as string | undefined);

  const details: { label: string; value: string | null }[] = [
    { label: "Business name", value: profile?.business_name ?? null },
    { label: "Address", value: profile?.business_address ?? null },
    { label: "Phone", value: profile?.business_phone ?? null },
    { label: "Website", value: profile?.business_website ?? null },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16 sm:px-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Business dashboard
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Welcome{ownerName ? `, ${ownerName}` : ""}.
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          You&apos;re signed in to{" "}
          <span className="font-bold text-lokala-brown-dark">{businessName}</span>
          . Manage how your business shows up to local customers across
          Waterville.
        </p>
      </div>

      <section className="rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card">
        <h2 className="text-lg font-extrabold text-lokala-brown-dark">
          Business details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {details.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-bold uppercase tracking-wide text-lokala-muted">
                {item.label}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-lokala-brown-dark">
                {item.value ?? (
                  <span className="font-normal text-lokala-muted">
                    Not added yet
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div>
        <Link
          href="/"
          className="inline-block rounded-full border border-lokala-border bg-white px-6 py-3 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
