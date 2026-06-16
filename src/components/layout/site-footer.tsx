import Link from "next/link";

import { BrandWordmark } from "@/components/brand-wordmark";

const footerLinkClass =
  "text-sm font-medium text-lokala-muted transition-colors hover:text-lokala-green-dark";

const columnHeadingClass =
  "text-xs font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-lokala-border bg-lokala-cream">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="space-y-3">
            <Link
              href="/"
              className="inline-block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandWordmark className="text-xl" />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-lokala-muted">
              Support nearby businesses, discover local deals, and keep money in
              the Waterville community.
            </p>
          </div>

          <nav aria-label="For shoppers" className="space-y-3">
            <p className={columnHeadingClass}>For Shoppers</p>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link href="/browse" className={footerLinkClass}>
                  Browse Deals
                </Link>
              </li>
              <li>
                <Link href="/gift-certificates" className={footerLinkClass}>
                  Gift Certificates
                </Link>
              </li>
              <li>
                <Link href="/my-redemptions" className={footerLinkClass}>
                  My Redemptions
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="For businesses" className="space-y-3">
            <p className={columnHeadingClass}>For Businesses</p>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link href="/signup" className={footerLinkClass}>
                  List Your Business
                </Link>
              </li>
              <li>
                <Link href="/restaurant/dashboard" className={footerLinkClass}>
                  Business Dashboard
                </Link>
              </li>
              <li>
                <Link href="/contact" className={footerLinkClass}>
                  Contact
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Community" className="space-y-3">
            <p className={columnHeadingClass}>Community</p>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link href="/about" className={footerLinkClass}>
                  About Lokala
                </Link>
              </li>
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
          </nav>
        </div>

        <div className="mt-10 border-t border-lokala-border pt-6 text-center text-xs text-lokala-muted sm:text-sm">
          © 2026 myLokala · Built for local discovery in Waterville, Maine.
        </div>
      </div>
    </footer>
  );
}
