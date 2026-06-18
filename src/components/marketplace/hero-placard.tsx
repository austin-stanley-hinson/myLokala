"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Photos live in /public. Slide 0 is the branded intro; these follow it.
const PHOTOS = [
  "/w3.avif",
  "/w4.jpg",
  "/w5.jpg",
  "/w6.jpg",
  "/w7.jpg",
  "/w8.jpg",
];

const SLIDE_COUNT = PHOTOS.length + 1; // + branded intro
const INTERVAL_MS = 5000;

/**
 * Hero placard that opens on the Waterville branded slide, then slowly dissolves
 * (crossfades) through the local photos every 5 seconds, looping back to the start.
 */
export function HeroPlacard() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDE_COUNT);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const slideClass = (isActive: boolean) =>
    `absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${
      isActive ? "opacity-100" : "opacity-0"
    }`;

  return (
    <div className="relative">
      <div className="absolute -left-5 -top-5 h-28 w-28 rounded-full bg-lokala-sun-soft blur-2xl" />
      <div className="absolute -bottom-6 -right-4 h-32 w-32 rounded-full bg-lokala-green-light blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white bg-white p-3 shadow-lokala-card">
        <div className="relative h-[340px] w-full overflow-hidden rounded-[2rem] sm:h-[420px]">
          {/* Slide 0 — branded intro */}
          <div
            aria-hidden={active !== 0}
            className={`${slideClass(
              active === 0,
            )} flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-lokala-green-soft via-lokala-cream to-lokala-sun-soft`}
          >
            <Image
              src="/lokala-logo.png"
              alt="Lokala"
              width={120}
              height={120}
              className="h-24 w-24 rounded-3xl bg-white object-contain p-2 shadow-lokala-soft"
              priority
            />
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lokala-green-dark">
                Waterville · Maine
              </p>
              <p className="mt-1 font-heading text-2xl font-extrabold text-lokala-brown-dark">
                Rooted in your community
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 px-6">
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-lokala-brown">
                Pine-town charm
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-lokala-green-dark">
                Shop small
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-lokala-sky-dark">
                Local first
              </span>
            </div>
          </div>

          {/* Photo slides */}
          {PHOTOS.map((src, i) => (
            <div
              key={src}
              aria-hidden={active !== i + 1}
              className={slideClass(active === i + 1)}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
