import Link from "next/link";

import { getBusinessContext } from "@/lib/auth/business-context";
import { EditableBusinessProfile } from "@/components/business/editable-business-profile";

export const dynamic = "force-dynamic";

export default async function BusinessProfilePage() {
  const { profile } = await getBusinessContext();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Business profile
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Business details
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Keep your business information up to date so customers see the right
          details.
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

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
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
              How do I update my business details?
            </dt>
            <dd className="mt-1 text-sm leading-6 text-lokala-muted">
              Use the{" "}
              <span className="font-bold text-lokala-brown-dark">
                Business details
              </span>{" "}
              section above to edit your name, address, phone, and website.
            </dd>
          </div>
          <div className="rounded-2xl border border-lokala-border bg-white p-4">
            <dt className="text-sm font-bold text-lokala-brown-dark">
              Why keep my profile updated?
            </dt>
            <dd className="mt-1 text-sm leading-6 text-lokala-muted">
              Accurate details help customers find and trust you. Ready to sell?{" "}
              <Link
                href="/business/payments"
                className="font-bold text-lokala-green-dark underline underline-offset-4"
              >
                Set up payments
              </Link>
              .
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
