import { getBusinessContext } from "@/lib/auth/business-context";
import { DeferredFeatureNotice } from "@/components/layout/deferred-feature-notice";

export const dynamic = "force-dynamic";

/**
 * QUARANTINED (gift-balance MVP): the merchant QR panel loaded/created rows in
 * the legacy `business_qr_codes` table, and gift-certificate publishing depends
 * on the deferred Stripe rebuild. The session + active `merchant_members` guard
 * (`getBusinessContext`) is preserved and still gates this page — the notice
 * below never bypasses merchant authorization. Legacy QR / gift-certificate
 * components remain in the repo for later phases.
 */
export default async function BusinessGiftCertificatesPage() {
  // Guard: only active merchant members reach this page.
  const { merchant } = await getBusinessContext();
  const businessName = merchant.display_name;

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
          Tools for {businessName} to sell gift certificates to local customers.
        </p>
      </header>

      <DeferredFeatureNotice
        eyebrow="Coming next"
        title="Gift certificate tools are being rebuilt"
        description="Your Lokala QR code and gift-certificate publishing are being rebuilt on the new gift-balance platform, together with payments and payouts. They'll return here soon — no action is needed right now."
        actions={[{ href: "/business", label: "Back to dashboard" }]}
      />
    </div>
  );
}
