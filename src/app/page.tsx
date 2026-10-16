import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bookmark, MapPin, Store } from "lucide-react";

import { AppStoreButton } from "@/components/app/app-store-button";
import { DownloadCta } from "@/components/app/download-cta";
import { QrCard } from "@/components/app/qr-card";
import { Reveal } from "@/components/app/reveal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Lokala | Always Local",
  description:
    "Lokala shows you the deals running at local shops, cafés, and restaurants near you. Free on the App Store.",
  path: "/",
});

const STEPS = [
  {
    icon: MapPin,
    title: "See what's on nearby",
    body: "Open the app and the deals at local spots around you show up. No hunting through flyers or five different feeds.",
  },
  {
    icon: Bookmark,
    title: "Save the good ones",
    body: "Spot something worth the trip? Save it for later so it's there when you're actually hungry, thirsty, or out of birthday gifts.",
  },
  {
    icon: Store,
    title: "Show it at the counter",
    body: "Pull it up in the app when you pay. Easy for you, easy for them, and your money stays right here in town.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="rise-in inline-flex items-center gap-2 rounded-full border border-lokala-border bg-white/80 px-3.5 py-1.5 text-sm font-bold text-lokala-green-dark shadow-sm">
              <span className="relative flex size-2">
                <span className="absolute inset-0 rounded-full bg-lokala-green motion-safe:animate-[lokala-pulse-ring_1.8s_ease-out_infinite]" />
                <span className="relative size-2 rounded-full bg-lokala-green" />
              </span>
              Now on the App Store
            </p>
            <h1 className="rise-in mt-6 text-5xl font-bold leading-[1.05] [--rise-delay:80ms] sm:text-6xl lg:text-[4.25rem]">
              Good deals,{" "}
              <span className="relative whitespace-nowrap text-lokala-green-dark">
                right down
                <svg
                  aria-hidden
                  viewBox="0 0 300 12"
                  preserveAspectRatio="none"
                  className="absolute -bottom-2 left-0 h-3 w-full text-lokala-sun"
                >
                  <path
                    d="M2 9 C 80 2, 200 2, 298 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    pathLength={1}
                    className="[stroke-dasharray:1] [stroke-dashoffset:1] motion-safe:animate-[lokala-draw_0.9s_0.7s_ease-out_forwards] motion-reduce:[stroke-dashoffset:0]"
                  />
                </svg>
              </span>{" "}
              the street.
            </h1>
            <p className="rise-in mt-6 max-w-xl text-lg text-lokala-muted [--rise-delay:160ms] sm:text-xl">
              Lokala shows you what&apos;s on at the cafés, shops, and
              restaurants around you, so going local is the easy choice. Open
              it, find something good, go get it.
            </p>
            <div className="rise-in mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 [--rise-delay:240ms]">
              <AppStoreButton />
              <span className="text-sm font-semibold text-lokala-muted">
                Free on iPhone
              </span>
            </div>
          </div>

          <div className="rise-in relative mx-auto w-full max-w-md [--rise-delay:200ms] lg:max-w-none">
            <div className="relative aspect-4/5 overflow-hidden rounded-[2.5rem] border-[6px] border-white shadow-lokala-lift sm:aspect-square lg:aspect-4/5">
              <Image
                src="/w5.jpg"
                alt="Main Street in downtown Waterville at sunset"
                fill
                priority
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-lokala-brown-dark/40 via-transparent to-transparent" />
              <p className="absolute bottom-5 left-5 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-lokala-brown-dark backdrop-blur">
                Downtown Waterville, ME
              </p>
            </div>
            <QrCard float className="absolute -left-10 top-10 hidden lg:block" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
              How it works
            </p>
            <h2 className="mt-3 text-4xl font-bold sm:text-5xl">
              Three taps between you and a good afternoon.
            </h2>
          </Reveal>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal
                as="li"
                key={step.title}
                delay={i * 110}
                className="group relative rounded-lokala-lg border border-lokala-border bg-white/90 p-7 shadow-lokala-card transition duration-300 hover:-translate-y-1 hover:shadow-lokala-lift"
              >
                <span
                  aria-hidden
                  className="absolute right-6 top-5 font-heading text-5xl font-bold text-lokala-green-light"
                >
                  {i + 1}
                </span>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <step.icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-lokala-muted">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* About teaser */}
      <section id="about" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <Reveal className="relative order-2 grid grid-cols-5 gap-4 lg:order-1">
            <div className="relative col-span-3 aspect-3/4 overflow-hidden rounded-lokala-lg shadow-lokala-card">
              <Image
                src="/w4.jpg"
                alt="Welcome to Downtown Waterville sign"
                fill
                sizes="(min-width: 1024px) 30vw, 60vw"
                className="object-cover transition-transform duration-700 hover:scale-105"
              />
            </div>
            <div className="relative col-span-2 mt-12 aspect-3/4 overflow-hidden rounded-lokala-lg shadow-lokala-card">
              <Image
                src="/w8.jpg"
                alt="The Kennebec River in autumn"
                fill
                sizes="(min-width: 1024px) 20vw, 40vw"
                className="object-cover transition-transform duration-700 hover:scale-105"
              />
            </div>
          </Reveal>

          <Reveal className="order-1 lg:order-2" delay={100}>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
              About Lokala
            </p>
            <h2 className="mt-3 text-4xl font-bold sm:text-5xl">
              Made in Maine, for Main Street.
            </h2>
            <div className="mt-6 space-y-4 text-lg text-lokala-muted">
              <p>
                Waterville is full of good places. The diner that knows your
                order. The bookshop with the cat in the window. The pizza place
                that&apos;s been there longer than the stoplights. Most of them
                run deals all the time, and most of us never hear about them.
              </p>
              <p>
                Lokala puts all of that in one spot, right on your phone. Less
                scrolling past ads for stuff shipped from who-knows-where, more
                lunches at the place two blocks over.
              </p>
            </div>
            <Link
              href="/about"
              className="group mt-8 inline-flex items-center gap-2 text-lg font-bold text-lokala-green-dark"
            >
              Read our story
              <ArrowRight
                className="size-5 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          </Reveal>
        </div>
      </section>

      <DownloadCta />
    </>
  );
}
