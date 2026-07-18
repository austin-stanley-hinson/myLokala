import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
import { PayAmountForm } from "@/components/pay/pay-amount-form";
import { lookupBusinessForQrCode } from "@/lib/business/qr-public";

export const dynamic = "force-dynamic";

type PayPageProps = {
  params: Promise<{ public_code: string }>;
};

export async function generateMetadata({
  params,
}: PayPageProps): Promise<Metadata> {
  const { public_code } = await params;
  const business = await lookupBusinessForQrCode(public_code);

  if (!business) {
    return {
      title: {
        absolute: "Payment link not found | Lokala",
      },
      robots: { index: false, follow: false },
    };
  }

  return {
    title: {
      absolute: `Pay ${business.business_name} | Lokala`,
    },
    description: `Pay ${business.business_name} with Lokala.`,
    robots: { index: false, follow: false },
  };
}

export default async function PayByQrPage({ params }: PayPageProps) {
  const { public_code } = await params;
  const business = await lookupBusinessForQrCode(public_code);

  if (!business) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 self-start">
          <Image
            src="/logo-try-1.png"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-xl object-cover"
          />
          <BrandWordmark className="text-xl" />
        </Link>
        <h1 className="text-2xl font-extrabold text-lokala-brown-dark">
          Payment link not found
        </h1>
        <p className="text-sm leading-6 text-lokala-muted">
          This QR code is inactive or doesn&apos;t match a Lokala business.
          Ask the business for their current Lokala QR code.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex w-fit rounded-full border border-lokala-border bg-white px-4 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
        >
          Back to Lokala
        </Link>
      </div>
    );
  }

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

        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-lokala-green-dark">
            Pay with Lokala
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
            {business.business_name}
          </h1>
          {business.business_address ? (
            <p className="mt-1 text-sm font-semibold text-lokala-muted">
              {business.business_address}
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-lokala-muted">
              Waterville, ME
            </p>
          )}
        </div>
      </header>

      <PayAmountForm businessName={business.business_name} />

      <p className="text-center text-xs font-semibold text-lokala-muted">
        No customer account required on the web. Payment processing is not live
        yet.
      </p>
    </div>
  );
}
