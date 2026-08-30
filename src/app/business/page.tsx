import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, MapPin, Store } from "lucide-react";

import { getBusinessContext } from "@/lib/auth/business-context";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Lokala for Businesses | Gift Balance",
  description:
    "Manage your Lokala merchant profile, locations, and payment QR codes.",
  path: "/business",
});

export default async function BusinessOverviewPage() {
  const { displayName, role, merchant } = await getBusinessContext();
  const ownerName = displayName ?? undefined;
  const businessName = merchant.display_name;

  const cards = [
    {
      href: "/business/profile",
      label: "Business profile",
      description: "Update your business name, contact details, and description.",
      hint: businessName,
      icon: Store,
    },
    {
      href: "/business/locations",
      label: "Locations & QR",
      description:
        "Add store locations and print a permanent payment QR for each one.",
      hint: "Ready now",
      icon: MapPin,
    },
    {
      href: "/business/payments",
      label: "Payments",
      description: "Connect payouts so customers can redeem Lokala balance.",
      hint: "Coming next",
      icon: CreditCard,
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
          on Lokala
          <span className="ml-2 rounded-full bg-lokala-green-light px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-lokala-green-dark">
            {role}
          </span>
          .
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
