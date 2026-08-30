import Link from "next/link";

import { getBusinessContext } from "@/lib/auth/business-context";

export const dynamic = "force-dynamic";

type DetailRow = { label: string; value: string | null };

export default async function BusinessProfilePage() {
  const { merchant, role } = await getBusinessContext();

  const details: DetailRow[] = [
    { label: "Business name", value: merchant.display_name },
    { label: "Legal name", value: merchant.legal_name },
    { label: "Support email", value: merchant.support_email },
    { label: "Support phone", value: merchant.support_phone },
    { label: "Website", value: merchant.website_url },
    { label: "Description", value: merchant.description },
  ];

  const canEdit = role === "owner" || role === "admin";

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
          Your business details on Lokala. Status:{" "}
          <span className="font-bold text-lokala-brown-dark">
            {merchant.status}
          </span>
          .
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
        <p className="mt-4 text-xs leading-5 text-lokala-muted">
          {canEdit
            ? "Editing business details from the dashboard is coming soon."
            : "Only an owner or admin can change these details."}
        </p>
      </section>

      <section
        aria-labelledby="account-help-heading"
        className="rounded-3xl border border-lokala-border bg-lokala-cream-light/60 p-6 shadow-lokala-card"
      >
        <h2
          id="account-help-heading"
          className="text-lg font-extrabold text-lokala-brown-dark"
        >
          Profile &amp; account help
        </h2>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-lokala-border bg-white p-4">
            <dt className="text-sm font-bold text-lokala-brown-dark">
              How do I change my password?
            </dt>
            <dd className="mt-1 text-sm leading-6 text-lokala-muted">
              We handle it by email.{" "}
              <Link
                href="/forgot-password"
                className="font-bold text-lokala-green-dark underline underline-offset-4"
              >
                Request a reset link
              </Link>{" "}
              and set a new password.
            </dd>
          </div>
          <div className="rounded-2xl border border-lokala-border bg-white p-4">
            <dt className="text-sm font-bold text-lokala-brown-dark">
              Ready to accept payments?
            </dt>
            <dd className="mt-1 text-sm leading-6 text-lokala-muted">
              Head to{" "}
              <Link
                href="/business/payments"
                className="font-bold text-lokala-green-dark underline underline-offset-4"
              >
                Payments
              </Link>{" "}
              to set up payouts.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
