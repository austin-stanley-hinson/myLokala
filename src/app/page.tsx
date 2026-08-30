import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Gift,
  QrCode,
  Send,
  Smartphone,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import { isActiveMerchantMember } from "@/lib/auth/merchant";
import { buildPageMetadata } from "@/lib/seo";
import { createTypedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Lokala | Always Local",
  description:
    "Lokala gift balance lets you buy and send local spending power, then pay participating merchants by scanning their QR code in the Lokala app. Businesses sign up here to accept Lokala.",
  path: "/",
});

type HowItWorksStep = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    icon: Wallet,
    title: "Load a Lokala gift balance",
    body: "Add funds to a Lokala balance that's ready to spend at participating local businesses — no physical card, no per-store gift certificates.",
  },
  {
    icon: Send,
    title: "Send balance as a gift",
    body: "Gift Lokala balance to friends, family, or neighbors. They claim it to their own wallet and can spend it anywhere Lokala is accepted.",
  },
  {
    icon: QrCode,
    title: "Pay by scanning in the app",
    body: "At checkout, open the Lokala mobile app and scan the merchant's QR code to pay from your balance in seconds.",
  },
];

export default async function HomePage() {
  const envConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // Tailor the primary action to the visitor. Merchant access is determined
  // solely by an active `merchant_members` row (the authorization source of
  // truth) — never legacy metadata, and never the retired deals catalog.
  let isBusiness = false;
  if (envConfigured) {
    const supabase = await createTypedClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      isBusiness = await isActiveMerchantMember(supabase, user.id);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="border-b border-lokala-border bg-lokala-cream-light">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
            The Lokala gift balance
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-lokala-brown-dark sm:text-5xl">
            Keep your spending local with <BrandWordmark className="text-inherit" />
          </h1>
          <p className="max-w-2xl text-lg text-lokala-muted">
            Buy Lokala balance, send it as a gift, and pay participating local
            merchants by scanning their QR code in the Lokala app. Money you load
            stays in the community you love.
          </p>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            {isBusiness ? (
              <Button
                variant="default"
                nativeButton={false}
                className="h-12 rounded-full px-6 text-base"
                render={<Link href="/business" />}
              >
                Go to your dashboard
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button
                variant="default"
                nativeButton={false}
                className="h-12 rounded-full px-6 text-base"
                render={<Link href="/signup" />}
              >
                Sign up your business
                <ArrowRight aria-hidden />
              </Button>
            )}
            <Button
              variant="outline"
              nativeButton={false}
              className="h-12 rounded-full px-6 text-base"
              render={<Link href="/login" />}
            >
              Business sign in
            </Button>
          </div>

          <p className="inline-flex items-center gap-2 text-sm text-lokala-muted">
            <Smartphone className="size-4 text-lokala-green-dark" aria-hidden />
            Shopping as a customer? Browsing, gifting, and paying all happen in
            the Lokala mobile app.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-lokala-brown-dark">
          How Lokala works
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="flex flex-col gap-3 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-bold text-lokala-brown-dark">
                  {step.title}
                </h3>
                <p className="text-sm leading-6 text-lokala-muted">
                  {step.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Business CTA */}
      <section className="border-t border-lokala-border bg-lokala-cream-light">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-6 rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
                <Store className="size-5" aria-hidden />
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-lokala-brown-dark">
                For local businesses
              </h2>
              <p className="max-w-xl text-sm leading-6 text-lokala-muted">
                Accept Lokala balance at your counter with a simple QR code, and
                manage everything from your merchant dashboard. Create an account
                to get set up — it only takes a few minutes.
              </p>
              <p className="inline-flex items-center gap-2 text-sm text-lokala-muted">
                <Gift className="size-4 text-lokala-green-dark" aria-hidden />
                New customers can discover and gift your business through Lokala.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:min-w-[200px]">
              {isBusiness ? (
                <Button
                  variant="default"
                  nativeButton={false}
                  className="h-11 rounded-full px-6"
                  render={<Link href="/business" />}
                >
                  Open dashboard
                  <ArrowRight aria-hidden />
                </Button>
              ) : (
                <Button
                  variant="default"
                  nativeButton={false}
                  className="h-11 rounded-full px-6"
                  render={<Link href="/signup" />}
                >
                  Sign up your business
                  <ArrowRight aria-hidden />
                </Button>
              )}
              <Button
                variant="outline"
                nativeButton={false}
                className="h-11 rounded-full px-6"
                render={<Link href="/login" />}
              >
                Business sign in
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
