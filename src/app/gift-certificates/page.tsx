import type { Metadata } from "next";

import { DeferredFeatureNotice } from "@/components/layout/deferred-feature-notice";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Lokala Gift Balance",
  description:
    "Buying and sending Lokala gift balance is being rebuilt on the new Lokala platform. Businesses can sign up now to accept Lokala.",
  path: "/gift-certificates",
});

/**
 * QUARANTINED (gift-balance MVP): the web purchase flow depended on the legacy
 * `gift_certificates` / `payment_transactions` tables and Stripe, all of which
 * are part of the deferred balance-purchasing rebuild. This route no longer
 * mounts the checkout (which would call the legacy Stripe gift APIs); it shows a
 * stable "coming next" state. The legacy gift-checkout components remain in the
 * repo for later reference.
 */
export default function GiftCertificatesPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <DeferredFeatureNotice
        eyebrow="Lokala gift balance"
        title="Sending gift balance is coming soon"
        description="Buying and gifting Lokala balance is being rebuilt on the new Lokala platform. Soon you'll be able to load a balance and send it to friends, family, and neighbors to spend at participating local businesses."
        actions={[
          { href: "/", label: "Back to home" },
          { href: "/signup", label: "Sign up your business" },
        ]}
      />
    </div>
  );
}
