import type { Metadata } from "next";
import Image from "next/image";

import { DownloadCta } from "@/components/app/download-cta";
import { Reveal } from "@/components/app/reveal";
import { buildPageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "About Lokala",
  description:
    "Lokala is a small Maine company making it easy to find deals at the local businesses around you.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <section className="px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-3xl">
          <p className="rise-in text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
            About Lokala
          </p>
          <h1 className="rise-in mt-3 text-5xl font-bold leading-[1.05] [--rise-delay:80ms] sm:text-6xl">
            We&apos;re Lokala. We&apos;re from around here.
          </h1>
        </div>

        <div className="rise-in relative mx-auto mt-10 aspect-video max-w-5xl overflow-hidden rounded-lokala-xl border-[6px] border-white shadow-lokala-lift [--rise-delay:180ms]">
          <Image
            src="/w5.jpg"
            alt="Main Street in downtown Waterville at sunset"
            fill
            priority
            sizes="(min-width: 1024px) 64rem, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-14 text-lg leading-relaxed text-lokala-text/85">
          <Reveal className="space-y-5">
            <p className="font-heading text-2xl leading-snug text-lokala-brown-dark sm:text-3xl">
              Lokala started with a small complaint.
            </p>
            <p>
              Downtown Waterville has great independent businesses, and plenty
              of them were running specials that nobody heard about. A
              chalkboard on the sidewalk. A post that got buried by lunchtime.
              Meanwhile, everyone&apos;s phone was busy telling them to order
              from somewhere two thousand miles away.
            </p>
            <p>
              So we built the app we wanted. Open Lokala and you&apos;ll see
              what&apos;s happening at the local places around you right now.
              Tuesday&apos;s deal at the bakery. Half-price apps at the pub
              you keep meaning to try. A weekend sale at the shop on the
              corner. Find one you like, save it, and show it at the counter.
              That&apos;s about it.
            </p>
          </Reveal>

          <Reveal className="space-y-5">
            <h2 className="text-3xl font-bold">Why bother with local?</h2>
            <p>
              Money spent at a local business tends to stick around. It pays a
              neighbor&apos;s paycheck, sponsors the Little League team, and
              keeps the lights on downtown. Nobody needs a lecture about that.
              They just need it to be easy, and that&apos;s the part we&apos;re
              working on.
            </p>
          </Reveal>

          <Reveal className="grid gap-4 sm:grid-cols-2">
            <div className="relative aspect-4/3 overflow-hidden rounded-lokala-lg shadow-lokala-card">
              <Image
                src="/w4.jpg"
                alt="Welcome to Downtown Waterville sign"
                fill
                sizes="(min-width: 640px) 24rem, 100vw"
                className="object-cover"
              />
            </div>
            <div className="relative aspect-4/3 overflow-hidden rounded-lokala-lg shadow-lokala-card">
              <Image
                src="/w8.jpg"
                alt="The Kennebec River in autumn"
                fill
                sizes="(min-width: 640px) 24rem, 100vw"
                className="object-cover"
              />
            </div>
          </Reveal>

          <Reveal className="space-y-5">
            <h2 className="text-3xl font-bold">Where we are</h2>
            <p>
              We&apos;re starting in Waterville and the rest of Mid-Maine,
              working directly with the businesses that make this a good place
              to live. If you own one of them and want in, we&apos;d love to
              hear from you at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="break-all font-semibold text-lokala-green-dark underline decoration-lokala-green/40 underline-offset-2 hover:decoration-lokala-green-dark"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <p className="font-heading text-2xl text-lokala-brown-dark">
              Always local. That&apos;s the whole idea.
            </p>
          </Reveal>
        </div>
      </section>

      <DownloadCta />
    </>
  );
}
