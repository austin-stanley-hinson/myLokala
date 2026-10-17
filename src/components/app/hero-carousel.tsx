"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type HeroSlide = { src: string; alt: string; caption: string };

const INTERVAL_MS = 5500;

/**
 * Crossfading photo carousel for the home hero. Autoplays and loops, pauses
 * while hovered/focused or when the tab is hidden, and never autoplays for
 * visitors who prefer reduced motion (the controls still work).
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const count = slides.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => setActive((next + count) % count),
    [count],
  );

  useEffect(() => {
    if (count <= 1 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      if (!document.hidden) setActive((prev) => (prev + 1) % count);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [count, paused]);

  const current = slides[active];

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Photos from around Waterville and Maine"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="group/carousel relative aspect-4/5 overflow-hidden rounded-[2.5rem] border-[6px] border-white bg-lokala-brown-dark shadow-lokala-lift sm:aspect-square lg:aspect-4/5"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.src}
          aria-hidden={active !== i}
          className={cn(
            "absolute inset-0 transition-opacity duration-[1400ms] ease-in-out",
            active === i ? "opacity-100" : "opacity-0",
          )}
        >
          <Image
            src={slide.src}
            alt={slide.alt}
            fill
            priority={i === 0}
            sizes="(min-width: 1024px) 40vw, 90vw"
            className={cn(
              "object-cover transition-transform duration-[7000ms] ease-out motion-reduce:transition-none",
              active === i ? "scale-100" : "scale-[1.06]",
            )}
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-lokala-brown-dark/45 via-transparent to-transparent" />

      <p
        key={current.caption}
        className="rise-in absolute bottom-5 left-5 max-w-[70%] rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-lokala-brown-dark backdrop-blur"
      >
        {current.caption}
      </p>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lokala-brown-dark shadow-lokala-soft transition hover:bg-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover/carousel:opacity-100"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lokala-brown-dark shadow-lokala-soft transition hover:bg-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover/carousel:opacity-100"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>

          <div className="absolute bottom-6 right-5 flex items-center gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={slide.src}
                type="button"
                aria-label={`Show photo ${i + 1} of ${count}`}
                aria-current={active === i}
                onClick={() => go(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  active === i
                    ? "w-6 bg-white"
                    : "w-2 bg-white/55 hover:bg-white/85",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
