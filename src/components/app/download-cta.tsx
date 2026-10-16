import Image from "next/image";

import { AppStoreButton } from "@/components/app/app-store-button";
import { QrCard } from "@/components/app/qr-card";
import { Reveal } from "@/components/app/reveal";

/** Closing "get the app" band shared by the home and about pages. */
export function DownloadCta() {
  return (
    <section id="download" className="scroll-mt-24 px-4 pb-20 sm:px-6">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-lokala-xl bg-lokala-green-dark px-6 py-12 text-white shadow-lokala-lift sm:px-12 sm:py-14">
        <Image
          src="/lokala-mark.png"
          alt=""
          aria-hidden
          width={420}
          height={420}
          className="pointer-events-none absolute -bottom-24 -right-16 size-80 opacity-[0.12] brightness-[3] grayscale motion-safe:animate-[lokala-sway_9s_ease-in-out_infinite] sm:size-[26rem]"
        />
        <div className="relative grid items-center gap-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Your next favorite spot is probably closer than you think.
            </h2>
            <p className="mt-4 text-lg text-white/85">
              Lokala is free on iPhone. Grab it, poke around, and go say hi to
              your neighbors.
            </p>
            <AppStoreButton className="mt-8" />
          </div>
          <QrCard className="hidden md:block" />
        </div>
      </Reveal>
    </section>
  );
}
