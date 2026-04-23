import Link from "next/link";

import { BrandWordmark } from "@/components/brand-wordmark";

const footerLinkClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70 bg-card/85 backdrop-blur-sm supports-[backdrop-filter]:bg-card/70 dark:bg-card/50 dark:supports-[backdrop-filter]:bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          <div className="space-y-3">
            <Link
              href="/"
              className="inline-block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandWordmark className="text-lg" />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Save local. Discover deals near you.
            </p>
          </div>

          <nav aria-label="Footer" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              Explore
            </p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/about" className={footerLinkClass}>
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/browse" className={footerLinkClass}>
                  Browse Coupons
                </Link>
              </li>
              <li>
                <Link href="/signup" className={footerLinkClass}>
                  For Businesses
                </Link>
              </li>
              <li>
                <Link href="/contact" className={footerLinkClass}>
                  Contact
                </Link>
              </li>
            </ul>
          </nav>

          <div className="space-y-3 sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              Legal & social
            </p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/privacy" className={footerLinkClass}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className={footerLinkClass}>
                  Terms of Service
                </Link>
              </li>
            </ul>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              <a
                href="https://www.instagram.com/"
                target="_blank"
                rel="noopener noreferrer"
                className={footerLinkClass}
              >
                Instagram
              </a>
              <a
                href="https://www.linkedin.com/"
                target="_blank"
                rel="noopener noreferrer"
                className={footerLinkClass}
              >
                LinkedIn
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border/50 pt-6 text-center text-xs text-muted-foreground sm:text-sm">
          © 2026 myLokala. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
