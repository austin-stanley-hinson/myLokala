import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { GiftCertificateCard } from "@/components/dashboard/gift-certificate-card";
import { SurfaceCard } from "@/components/dashboard/surface-card";

/**
 * Homepage right rail — support cards only.
 * Explore / secondary navigation lives in the left sidebar.
 */
export function DashboardRightRail() {
  return (
    <div className="flex flex-col gap-5">
      <GiftCertificateCard />
      <ListYourBusinessCard />
      <CommunitySpotlightCard />
      <LocalImpactCard />
    </div>
  );
}

function ListYourBusinessCard() {
  return (
    <SurfaceCard className="p-5">
      <h3 className="text-base font-extrabold text-lokala-brown-dark">
        For local businesses
      </h3>
      <p className="mt-2 text-sm leading-6 text-lokala-muted">
        List your business on Lokala and help nearby customers discover your
        deals and gift certificates.
      </p>
      <div className="mt-4 flex justify-center">
        <Link
          href="/signup"
          className="inline-flex w-full max-w-xs items-center justify-center rounded-full bg-lokala-green px-5 py-2.5 text-center text-sm font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark"
        >
          List your business
        </Link>
      </div>
    </SurfaceCard>
  );
}

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
