import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
import { DeferredFeatureNotice } from "@/components/layout/deferred-feature-notice";

export const dynamic = "force-dynamic";

type PayPageProps = {
  params: Promise<{ public_code: string }>;
};

/**
 * Static, non-indexed metadata. The page stays public but no longer looks the
 * business up in the legacy `business_qr_codes` table (via the QR RPC), so it
 * does not advertise a specific merchant while QR pay is deferred.
 */
export const metadata: Metadata = {
  title: {
    absolute: "Pay with Lokala",
  },
  description: "Paying local businesses with Lokala is coming soon.",
  robots: { index: false, follow: false },
};

/**
 * QUARANTINED (gift-balance MVP): QR pay depended on the legacy
 * `business_qr_codes` table and on payment processing that is not live yet.
 * This route remains PUBLIC (no auth) but no longer queries any legacy QR table.
 * It renders a stable "coming soon" state. The legacy QR/pay components remain
 * in the repo for the later payments phase.
 */
export default async function PayByQrPage({ params }: PayPageProps) {
  // Awaited so the dynamic segment is consumed, but intentionally unused: we no
  // longer resolve a specific business from the (missing) legacy QR table.
  await params;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-4">
        <Link href="/" className="inline-flex items-center gap-2 self-start">
          <span className="relative size-9 overflow-hidden rounded-xl bg-lokala-cream">
            <Image
              src="/logo-try-1.png"
              alt=""
              width={36}
              height={36}
              className="size-9 object-cover"
            />
          </span>
          <BrandWordmark className="text-xl" />
        </Link>
      </header>

      <DeferredFeatureNotice
        eyebrow="Pay with Lokala"
        title="QR payments are coming soon"
        description="Paying local businesses by scanning their Lokala QR code is being rebuilt on the new Lokala platform. Payment processing isn't live yet — check back soon."
        actions={[{ href: "/", label: "Back to Lokala" }]}
      />
    </div>
  );
}
