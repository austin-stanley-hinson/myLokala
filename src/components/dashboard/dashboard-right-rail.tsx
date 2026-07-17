import Image from "next/image";
import Link from "next/link";
import { Bookmark, Sparkles } from "lucide-react";

import { GiftCertificateCard } from "@/components/dashboard/gift-certificate-card";
import { SurfaceCard } from "@/components/dashboard/surface-card";

/**
 * Homepage dashboard right rail. On xl it sits beside the main column; below
 * xl it stacks under the content (handled by DashboardShell). Contains the
 * gift certificate card plus a real Saved Deals summary and two clearly-marked
 * static placeholder cards (Community Spotlight, Local Impact).
 */
export function DashboardRightRail({
  savedCount,
  isSignedIn,
}: {
  savedCount: number;
  isSignedIn: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <GiftCertificateCard />
      <SavedDealsCard savedCount={savedCount} isSignedIn={isSignedIn} />
      <CommunitySpotlightCard />
      <LocalImpactCard />
    </div>
  );
}

/**
 * Real data: uses the saved state already computed for the featured deals on
 * the homepage (no new query). The count therefore reflects saved deals among
 * the featured set, not a global total.
 */
function SavedDealsCard({
  savedCount,
  isSignedIn,
}: {
  savedCount: number;
  isSignedIn: boolean;
}) {
  return (
    <SurfaceCard className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-lokala-green-light text-lokala-green-dark">
          <Bookmark className="size-4" aria-hidden />
        </span>
        <h3 className="text-base font-extrabold text-lokala-brown-dark">
          Saved deals
        </h3>
      </div>

      {isSignedIn ? (
        <>
          <p className="mt-4 text-3xl font-extrabold text-lokala-green-dark">
            {savedCount}
            <span className="ml-1 text-sm font-bold text-lokala-muted">
              {savedCount === 1 ? "saved" : "saved"}
            </span>
          </p>
          <p className="mt-1 text-xs font-semibold text-lokala-muted">
            Across the featured deals below.
          </p>
          <Link
            href="/browse"
            className="mt-4 inline-block rounded-full border border-lokala-border bg-white px-4 py-2 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
          >
            Find more deals
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm leading-6 text-lokala-muted">
            Sign in to save local deals and pick up where you left off.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-full border border-lokala-border bg-white px-4 py-2 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
          >
            Sign in
          </Link>
        </>
      )}
    </SurfaceCard>
  );
}

/**
 * Static placeholder — no community/spotlight backend exists. Content is
 * generic and honest (no fake business names or claims). Uses an existing
 * Waterville photo as the cover image.
 */
function CommunitySpotlightCard() {
  return (
    <SurfaceCard className="overflow-hidden p-0">
      <div className="relative h-28">
        <Image
          src="/w7.jpg"
          alt=""
          fill
          sizes="(min-width: 1280px) 20rem, 100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-lokala-brown-dark/80 to-transparent" />
        <p className="absolute bottom-3 left-4 text-xs font-extrabold uppercase tracking-[0.16em] text-white">
          Community Spotlight
        </p>
      </div>
      <div className="p-5">
        <h3 className="text-base font-extrabold text-lokala-brown-dark">
          Waterville businesses are joining Lokala.
        </h3>
        <p className="mt-1 text-sm leading-6 text-lokala-muted">
          Discover offers from nearby restaurants, shops, and services around
          the community.
        </p>
      </div>
    </SurfaceCard>
  );
}

/**
 * Static placeholder — there is no rewards backend. Copy intentionally avoids
 * implying the user has earned anything.
 */
function LocalImpactCard() {
  return (
    <SurfaceCard className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-lokala-sun-soft text-lokala-brown-dark">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <h3 className="text-base font-extrabold text-lokala-brown-dark">
          Local impact
        </h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-lokala-muted">
        Every claim helps small businesses stay visible in the community.
      </p>
      <span className="mt-3 inline-block rounded-full bg-lokala-cream px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-lokala-muted">
        Rewards experience coming soon
      </span>
    </SurfaceCard>
  );
}
