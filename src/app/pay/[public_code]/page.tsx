import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
import { resolvePaymentHub } from "@/lib/merchant/setup";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createTypedClient } from "@/lib/supabase/server";
import { RedeemPanel } from "./redeem-panel";

export const dynamic = "force-dynamic";

type PayPageProps = {
  params: Promise<{ public_code: string }>;
};

async function loadHub(publicCode: string) {
  if (!hasPublicSupabaseEnv()) {
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

  let isAuthenticated = false;
  if (hub && hasPublicSupabaseEnv()) {
    const supabase = await createTypedClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  }

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
        <RedeemPanel hub={hub} initialIsAuthenticated={isAuthenticated} />
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
