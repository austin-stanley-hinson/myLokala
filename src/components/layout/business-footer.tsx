"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/business", label: "Dashboard" },
  { href: "/business/profile", label: "Profile" },
  { href: "/business/payments", label: "Payments" },
  { href: "/business/gift-certificates", label: "Gift certificates" },
] as const;

/**
 * Compact footer for the business portal only. Real working links — no
 * marketing CTAs or unwired placeholders.
 */
export function BusinessFooter() {
  const pathname = usePathname();
  const onBusiness =
    pathname === "/business" || pathname.startsWith("/business/");

  if (!onBusiness) return null;

  return (
    <footer className="mt-auto border-t border-lokala-border bg-white/80">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs font-semibold text-lokala-muted">
          Lokala business portal
        </p>
        <nav
          aria-label="Business portal"
          className="flex flex-wrap gap-x-4 gap-y-1"
        >
          {LINKS.map((link) => {
            const active =
              link.href === "/business"
                ? pathname === "/business"
                : pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs font-bold transition ${
                  active
                    ? "text-lokala-green-dark"
                    : "text-lokala-muted hover:text-lokala-green-dark"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
