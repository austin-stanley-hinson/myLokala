import Image from "next/image";

import { cn } from "@/lib/utils";

type QrCardProps = {
  className?: string;
  /** Gentle idle float; off for static placements. */
  float?: boolean;
};

/** Scan-to-download card. Pointless on the phone itself, so callers hide it on small screens. */
export function QrCard({ className, float = false }: QrCardProps) {
  return (
    <figure
      className={cn(
        "relative w-fit rounded-lokala-lg border border-lokala-border bg-white p-5 shadow-lokala-lift",
        float && "motion-safe:animate-[lokala-float_7s_ease-in-out_infinite]",
        className,
      )}
    >
      <Image
        src="/app-store-qr.png"
        alt="QR code linking to Lokala on the App Store"
        width={800}
        height={800}
        className="size-40 rounded-xl [image-rendering:pixelated] sm:size-44"
        priority
      />
      <figcaption className="mt-3 text-center text-sm font-bold text-lokala-brown-dark">
        Point your camera here
      </figcaption>
      <span
        aria-hidden
        className="absolute -right-3 -top-3 rounded-full bg-lokala-sun px-2.5 py-1 text-xs font-extrabold text-lokala-brown-dark shadow-lokala-card"
      >
        Free
      </span>
    </figure>
  );
}
