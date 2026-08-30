import Link from "next/link";

import { getBusinessContext } from "@/lib/auth/business-context";
import { BusinessQrSection } from "@/components/business/business-qr-section";
import { GiftCertificatesSection } from "@/components/business/gift-certificates-section";

export const dynamic = "force-dynamic";

export default async function BusinessGiftCertificatesPage() {
  const { userId, merchant } = await getBusinessContext();
  const businessName = merchant.display_name;
  // Stripe Connect readiness is part of the deferred payments rebuild.
  const connected = false;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Gift certificates
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Publish gift certificates
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Sell gift certificates for your business to local customers.
        </p>
      </header>

      <BusinessQrSection
        businessOwnerId={userId}
        businessName={businessName}
      />

      {!connected ? (
        <p className="rounded-2xl border border-lokala-border bg-lokala-brown-soft/40 px-4 py-3 text-sm text-lokala-brown">
          You&apos;ll need to{" "}
          <Link
            href="/business/payments"
            className="font-bold text-lokala-green-dark underline underline-offset-4"
          >
            connect Stripe
          </Link>{" "}
          before you can sell paid gift certificates and receive payouts.
        </p>
      ) : null}

      <GiftCertificatesSection />
    </div>
  );
}
