import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
import { createTypedClient } from "@/lib/supabase/server";
import { resolvePaymentHub } from "@/lib/merchant/setup";

export const dynamic = "force-dynamic";

type PayPageProps = {
  params: Promise<{ public_code: string }>;
};

async function loadHub(publicCode: string) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  const supabase = await createTypedClient();
  return resolvePaymentHub(supabase, publicCode);
}

export async function generateMetadata({
  params,
}: PayPageProps): Promise<Metadata> {
  const { public_code } = await params;
  const hub = await loadHub(public_code);

  if (!hub) {
    return {
      title: { absolute: "Payment link not found | Lokala" },
      robots: { index: false, follow: false },
    };
  }

  return {
    title: { absolute: `Pay ${hub.merchantDisplayName} | Lokala` },
    description: `Pay ${hub.merchantDisplayName} with Lokala gift balance.`,
    robots: { index: false, follow: false },
  };
}

export default async function PayByQrPage({ params }: PayPageProps) {
  const { public_code } = await params;
  const hub = await loadHub(public_code);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header>
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

      {hub ? (
        <section className="rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-lokala-green-dark">
            Pay with Lokala
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
            {hub.merchantDisplayName}
          </h1>
          {hub.locationLabel ? (
            <p className="mt-1 text-sm font-semibold text-lokala-muted">
              {hub.locationLabel}
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-lokala-muted">
              Waterville, ME
            </p>
          )}
          <p className="mt-5 text-sm leading-6 text-lokala-muted">
            Lokala-balance payment will be enabled in the upcoming payment
            phase. This is a valid merchant payment destination — customers will
            scan this code in the Lokala app to pay from their gift balance.
          </p>
          <p className="mt-4 rounded-2xl border border-lokala-border bg-lokala-cream-light px-4 py-3 text-sm text-lokala-brown">
            Redemption isn&apos;t live yet. No charge will be made from this
            page.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
          >
            Back to Lokala
          </Link>
        </section>
      ) : (
        <section className="rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card">
          <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
            Payment link not found
          </h1>
          <p className="mt-3 text-sm leading-6 text-lokala-muted">
            This QR code is inactive, expired, or doesn&apos;t match a Lokala
            business. Ask the business for their current Lokala QR code.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
          >
            Back to Lokala
          </Link>
        </section>
      )}
    </div>
  );
}
