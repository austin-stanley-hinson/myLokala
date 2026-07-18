import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { GiftCertificateCard } from "@/components/dashboard/gift-certificate-card";
import { SurfaceCard } from "@/components/dashboard/surface-card";

/**
 * Homepage dashboard right rail. On xl it sits beside the main column; below
 * xl it stacks under the content (handled by DashboardShell). Contains the
 * gift certificate card, a business sign-in prompt, and two clearly-marked
 * static placeholder cards (Community Spotlight, Local Impact).
 *
 * Saved/bookmark UI has been intentionally removed from the web experience for
 * now (customers use the Lokala mobile app); the saved_deals backend is
 * untouched.
 */
export function DashboardRightRail() {
  return (
    <div className="flex flex-col gap-5">
      <GiftCertificateCard />
      <BusinessSignInCard />
      <CommunitySpotlightCard />
      <LocalImpactCard />
    </div>
  );
}

/**
 * Directs local business owners/merchants to the existing business auth routes.
 * The web sign-in is B2B; customers browse here and act in the mobile app.
 */
function BusinessSignInCard() {
  return (
    <SurfaceCard className="p-5">
      <h3 className="text-base font-extrabold text-lokala-brown-dark">
        For local businesses
      </h3>
      <p className="mt-2 text-sm leading-6 text-lokala-muted">
        Own a Waterville business? Sign in to manage your listings and deals, or
        create an account to get started.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <Link
          href="/login"
          className="inline-flex flex-1 items-center justify-center rounded-full bg-lokala-green px-3 py-2.5 text-center text-sm font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark"
        >
          Business sign in
        </Link>
        <Link
          href="/signup"
          className="inline-flex flex-1 items-center justify-center rounded-full border border-lokala-border bg-white px-3 py-2.5 text-center text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
        >
          List your business
        </Link>
      </div>
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
        Every local deal helps small businesses stay visible in the community.
      </p>
      <span className="mt-3 inline-block rounded-full bg-lokala-cream px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-lokala-muted">
        More community tools coming soon
      </span>
    </SurfaceCard>
  );
}
