"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_LINKS } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Primary nav links with the current page highlighted. */
export function NavLinks({
  className,
  linkClassName,
}: {
  className?: string;
  linkClassName?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className={className}>
      {NAV_LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 font-semibold transition-colors",
              active
                ? "bg-white text-lokala-green-dark shadow-sm"
                : "text-lokala-brown hover:bg-white hover:text-lokala-green-dark",
              linkClassName,
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
