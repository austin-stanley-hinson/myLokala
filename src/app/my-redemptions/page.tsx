import { DeferredFeatureNotice } from "@/components/layout/deferred-feature-notice";

export const dynamic = "force-dynamic";

/**
 * QUARANTINED (gift-balance MVP): the legacy `redemptions` table does not exist
 * in the new schema, and deal redemption history is postponed with the rest of
 * the discounts phase. This route no longer queries the database; customer
 * activity lives in the Lokala mobile app. The legacy redemptions components
 * remain in the repo for later reference.
 */
export default function MyRedemptionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <DeferredFeatureNotice
        eyebrow="My activity"
        title="Redemption history is moving to the app"
        description="Your Lokala activity and spending history will live in the Lokala mobile app as we roll out the gift balance. There's nothing to show here on the web yet."
        actions={[{ href: "/", label: "Back to home" }]}
      />
    </div>
  );
}
