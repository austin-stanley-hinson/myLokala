import Image from "next/image";
import Link from "next/link";

import { AppStoreButton } from "@/components/app/app-store-button";
import { BrandWordmark } from "@/components/brand-wordmark";
import { NAV_LINKS } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-lokala-border/70 bg-lokala-cream-light/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/lokala-mark.png"
            alt=""
            width={44}
            height={44}
            priority
            className="size-10 origin-bottom transition-transform duration-500 group-hover:motion-safe:animate-[lokala-sway_1.2s_ease-in-out_infinite] sm:size-11"
          />
          <BrandWordmark className="text-2xl" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-base font-semibold text-lokala-brown transition-colors hover:bg-white hover:text-lokala-green-dark"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <AppStoreButton compact className="rounded-xl" />
      </div>
    </header>
  );
}
