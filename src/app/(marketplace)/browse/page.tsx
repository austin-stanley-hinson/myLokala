import type { Metadata } from "next";

import { DeferredFeatureNotice } from "@/components/layout/deferred-feature-notice";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Local Deals | Lokala",
  description:
    "Local deal discovery is being rebuilt for the Lokala gift-balance experience. Businesses can sign up now to accept Lokala.",
  path: "/browse",
});

/**
 * QUARANTINED (gift-balance MVP): the legacy `deals` table does not exist in the
 * new schema, and discount/deal discovery is postponed. This route no longer
 * queries any database table; it shows a stable "coming next" state. The legacy
 * deal components remain in the repo for the later discounts phase.
 */
export default function BrowsePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <DeferredFeatureNotice
        eyebrow="Local deals"
        title="Deal discovery is coming back soon"
        description="We're rebuilding local deals around the new Lokala gift balance. In the meantime, you can send and spend Lokala balance in the mobile app, and local businesses can sign up to accept Lokala."
        actions={[
          { href: "/", label: "Back to home" },
          { href: "/signup", label: "Sign up your business" },
        ]}
      />
    </div>
  );
}
