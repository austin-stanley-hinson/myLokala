import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Gift, Store } from "lucide-react";

import { getBusinessContext, isPaymentsConnected } from "@/lib/auth/business-context";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * Safe generic metadata for the business portal entry. The page itself remains
 * auth-gated (redirects non-owners). Not listed in the public sitemap.
 */
export const metadata: Metadata = buildPageMetadata({
  title: "Lokala for Businesses | Local Deals and Gift Certificates",
  description:
    "Create a Lokala business account to manage your local business profile, prepare gift certificates, and connect payments securely.",
  path: "/business",
});

export default async function BusinessOverviewPage() {
  const { ownerName, businessName, paymentAccount } = await getBusinessContext();

  const connected = isPaymentsConnected(paymentAccount);
  const paymentsHint = connected
    ? "Connected — ready for payouts"
    : paymentAccount?.onboarding_status === "restricted"
      ? "Action needed to finish setup"
      : paymentAccount?.onboarding_status === "pending"
        ? "Verification in progress"
        : "Not connected yet";

  const cards = [
    {
      href: "/business/profile",
      label: "Business profile",
      description: "Update your business name, address, phone, and website.",
      hint: businessName,
      icon: Store,
    },
    {
      href: "/business/payments",
      label: "Payments",
      description: "Connect Stripe to accept payments and receive payouts.",
      hint: paymentsHint,
      icon: CreditCard,
    },
    {
      href: "/business/gift-certificates",
      label: "Gift certificates",
      description: "Publish gift certificates for local customers to buy.",
      hint: "Coming soon",
      icon: Gift,
    },
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

      <section>
        <h2 className="text-lg font-extrabold text-lokala-brown-dark">
          Manage your business
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <li key={card.href}>
                <Link
                  href={card.href}
                  className="flex h-full flex-col rounded-3xl border border-lokala-border bg-white p-5 shadow-lokala-card transition hover:border-lokala-green hover:shadow-lokala-soft"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-extrabold text-lokala-brown-dark">
                    {card.label}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-lokala-muted">
                    {card.description}
                  </p>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-lokala-green-dark">
                    {card.hint}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
