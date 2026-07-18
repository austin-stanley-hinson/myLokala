"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, Home, Tag, type LucideIcon } from "lucide-react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon };

const PRIMARY_NAV: NavLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/browse", label: "Deals", icon: Tag },
  { href: "/gift-certificates", label: "Gift Certificates", icon: Gift },
];

const EXPLORE_LINKS = [
  { href: "/about", label: "About Lokala" },
  { href: "/contact", label: "Contact" },
  { href: "/signup", label: "For businesses" },
  { href: "/gift-certificates", label: "Gift certificates" },
] as const;

export function DashboardSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-2 outline-none focus-visible:ring-2 focus-visible:ring-lokala-green"
        aria-label="Lokala home"
      >
        <span className="relative size-9 shrink-0 overflow-hidden rounded-xl bg-lokala-cream">
          <Image
            src="/logo-try-1.png"
            alt=""
            width={36}
            height={36}
            className="size-9 object-cover"
            priority
          />
        </span>
        <BrandWordmark className="text-xl" />
      </Link>

      <nav className="flex flex-col gap-1" aria-label="Dashboard">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition",
                active
                  ? "bg-lokala-green-light text-lokala-green-dark shadow-lokala-soft"
                  : "text-lokala-brown hover:bg-lokala-cream",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Explore"
        className="mt-auto border-t border-lokala-border pt-4"
      >
        <p className="px-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-lokala-muted">
          Explore
        </p>
        <ul className="mt-2 flex flex-col gap-0.5">
          {EXPLORE_LINKS.map((link) => (
            <li key={link.href + link.label}>
              <Link
                href={link.href}
                onClick={onNavigate}
                className="block rounded-xl px-3 py-1.5 text-sm font-semibold text-lokala-brown transition hover:bg-lokala-cream hover:text-lokala-green-dark"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
