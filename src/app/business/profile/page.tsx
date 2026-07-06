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

      <section className="rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card">
        <h2 className="text-lg font-extrabold text-lokala-brown-dark">
          Password &amp; security
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-lokala-muted">
          Password changes are handled securely by email. Request a reset link
          and we&apos;ll send it to your account email so you can set a new
          password.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-flex rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
        >
          Send password reset link
        </Link>
      </section>
    </div>
  );
}
