"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

// Rotating mission headlines (from the approved concept).
const HEADLINES = [
  "Support Local. Live Local.",
  "Discover Waterville\u2019s Local Favorites.",
  "Send Local Love with Gift Certificates.",
];

const INTERVAL_MS = 6000;

/**
 * Central hero card: a contained crossfading image carousel (reusing the same
 * opacity-transition approach as HeroPlacard) with mission copy, CTAs, and
 * frontend-only controls (prev/next + dots). Autoplays and loops.
 *
 * CTAs link only to existing routes (/browse, /gift-certificates).
 */
export function DashboardHero({ images }: { images: string[] }) {
  const count = images.length;
  const [active, setActive] = useState(0);

  const go = useCallback(
    (next: number) => setActive((next + count) % count),
    [count],
  );

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(
      () => setActive((prev) => (prev + 1) % count),
      INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [count]);

  const headline = HEADLINES[active % HEADLINES.length];

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-lokala-border shadow-lokala-card">
      <div className="absolute inset-0">
        {images.map((src, i) => (
          <div
            key={src}
            aria-hidden={active !== i}
            className={cn(
              "absolute inset-0 transition-opacity duration-[1500ms] ease-in-out",
              active === i ? "opacity-100" : "opacity-0",
            )}
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="(min-width: 1280px) 60vw, 100vw"
              className="object-cover object-center"
              priority={i === 0}
            />
          </div>
        ))}
        {/* Warm overlay keeps the copy readable over any photo. Kept softer so
            more of the original photo colors/detail show through. */}
        <div className="absolute inset-0 bg-gradient-to-tr from-lokala-brown-dark/65 via-lokala-brown-dark/35 to-lokala-brown-dark/5" />
      </div>

      <div className="relative flex min-h-[22rem] flex-col justify-end gap-5 p-6 sm:min-h-[26rem] sm:p-10 lg:min-h-[30rem]">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/50 bg-transparent px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-lokala-green" aria-hidden />
          Waterville &middot; Maine
        </span>

        <h1 className="max-w-2xl text-3xl font-extrabold leading-tight text-white drop-shadow-sm sm:text-5xl">
          {headline}
        </h1>

        <p className="max-w-xl text-base font-medium text-white/90 sm:text-lg">
          Discover local deals, favorite spots, and gift certificates from the
          Waterville businesses that make our community thrive.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/browse"
            className="rounded-full bg-lokala-green px-7 py-3.5 text-center font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark"
          >
            Browse Deals
          </Link>
          <Link
            href="/gift-certificates"
            className="rounded-full border border-white/70 bg-white/10 px-7 py-3.5 text-center font-bold text-white backdrop-blur transition hover:bg-white/20"
          >
            Buy Gift Certificates
          </Link>
        </div>
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lokala-brown-dark shadow-lokala-soft transition hover:bg-white sm:inline-flex"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lokala-brown-dark shadow-lokala-soft transition hover:bg-white sm:inline-flex"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>

          <div className="absolute bottom-4 right-5 flex items-center gap-1.5">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={active === i}
                onClick={() => go(i)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  active === i ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
