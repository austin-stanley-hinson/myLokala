import Image from "next/image";
import Link from "next/link";

import { BrandWordmark } from "@/components/brand-wordmark";
import { APP_STORE_URL, COMPANY, CONTACT_EMAIL } from "@/lib/site";

const FOOTER_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Lokala" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/contact", label: "Contact" },
];

const footerLinkClass =
  "text-sm font-medium text-lokala-muted transition-colors hover:text-lokala-green-dark";

const columnHeadingClass =
  "text-xs font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-lokala-border bg-lokala-cream">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-3">
            <Link href="/" className="inline-flex items-center gap-2">
              <Image
                src="/lokala-mark.png"
                alt=""
                width={36}
                height={36}
                className="size-9"
              />
              <BrandWordmark className="text-xl" />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-lokala-muted">
              Good deals from the local places you already love, and a few you
              haven&apos;t found yet. Always local.
            </p>
          </div>

          <nav aria-label="Footer" className="space-y-3">
            <p className={columnHeadingClass}>Lokala</p>
            <ul className="flex flex-col gap-2.5">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLinkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footerLinkClass}
                >
                  Get the app
                </a>
              </li>
            </ul>
          </nav>

          <div className="space-y-3">
            <p className={columnHeadingClass}>Say hello</p>
            <address className="flex flex-col gap-2.5 text-sm not-italic text-lokala-muted">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={`${footerLinkClass} break-all`}
              >
                {CONTACT_EMAIL}
              </a>
              <span>
                {COMPANY.street}
                <br />
                {COMPANY.locality}, {COMPANY.region}
              </span>
            </address>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-lokala-border pt-6 text-xs text-lokala-muted sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p>© 2026 {COMPANY.legalName}. All rights reserved.</p>
          <p>Made in Maine.</p>
        </div>
      </div>
    </footer>
  );
}
