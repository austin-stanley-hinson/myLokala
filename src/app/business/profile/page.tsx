import Link from "next/link";

import { getBusinessContext } from "@/lib/auth/business-context";
import { canManageMerchant } from "@/lib/auth/merchant";
import { MerchantProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

type DetailRow = { label: string; value: string | null };

export default async function BusinessProfilePage() {
  const { merchant, role } = await getBusinessContext();
  const canEdit = canManageMerchant(role);

  const details: DetailRow[] = [
    { label: "Business name", value: merchant.display_name },
    { label: "Legal name", value: merchant.legal_name },
    { label: "Support email", value: merchant.support_email },
    { label: "Support phone", value: merchant.support_phone },
    { label: "Website", value: merchant.website_url },
    { label: "Description", value: merchant.description },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Business profile
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          {merchant.display_name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Status:{" "}
          <span className="font-bold capitalize text-lokala-brown-dark">
            {merchant.status}
          </span>
          {canEdit
            ? " — owners and admins can update these details."
            : " — you can view these details; only an owner or admin can edit them."}
        </p>
      </header>

      <section
        aria-labelledby="business-details-heading"
        className="rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
      >
        <h2
          id="business-details-heading"
          className="text-lg font-extrabold text-lokala-brown-dark"
        >
          Business details
        </h2>

        {canEdit ? (
          <MerchantProfileForm merchant={merchant} />
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {details.map((row) => (
              <div
                key={row.label}
                className="rounded-2xl border border-lokala-border bg-lokala-cream-light/60 p-4"
              >
                <dt className="text-xs font-bold uppercase tracking-wide text-lokala-green-dark">
                  {row.label}
                </dt>
                <dd className="mt-1 text-sm leading-6 text-lokala-brown-dark">
                  {row.value ?? (
                    <span className="text-lokala-muted">Not set</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section
        aria-labelledby="account-help-heading"
        className="rounded-3xl border border-lokala-border bg-lokala-cream-light/60 p-6 shadow-lokala-card"
      >
        <h2
          id="account-help-heading"
          className="text-lg font-extrabold text-lokala-brown-dark"
        >
          Next steps
        </h2>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Add a location to get a permanent Lokala payment QR code. Connecting
          payments for customer redemptions will return in a later phase.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/business/locations"
            className="inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
          >
            Manage locations
          </Link>
          <Link
            href="/business/payments"
            className="inline-flex rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
          >
            Payments (coming next)
          </Link>
        </div>
      </section>
    </div>
  );
}
