"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gift,
  Home,
  Settings,
  Tag,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon };
type NavPlaceholder = { label: string; icon: LucideIcon };

// Clickable items point ONLY at real, existing routes. Customer redemption is
// mobile-app only, so no "Redemptions" account entry is surfaced on the web.
const PRIMARY_NAV: NavLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/browse", label: "Deals", icon: Tag },
  { href: "/gift-certificates", label: "Gift Certificates", icon: Gift },
];

// Concept nav items that have no web backend/route yet. Rendered as clearly
// disabled, non-clickable placeholders purely to preserve the app-like sidebar
// structure. These must not ship as if functional (see Phase 1 report).
const PLACEHOLDER_NAV: NavPlaceholder[] = [
  { label: "Community", icon: Users },
  { label: "Profile", icon: UserRound },
  { label: "Settings", icon: Settings },
];

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
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-lokala-soft">
          <Image
            src="/logo-try-1.png"
            alt=""
            width={44}
            height={44}
            className="size-8 object-contain"
            priority
          />
        </span>
        <BrandWordmark className="text-xl" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Dashboard">
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

        <div className="my-2 border-t border-lokala-border" />

        {PLACEHOLDER_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              aria-disabled="true"
              title="Coming soon"
              className="flex cursor-not-allowed items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold text-lokala-muted/70"
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {item.label}
              <span className="ml-auto rounded-full bg-lokala-cream px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-lokala-muted">
                Soon
              </span>
            </span>
          );
        })}
      </nav>

      {/* Bottom promo/help card — links to the real business sign-up route. */}
      <Link
        href="/signup"
        onClick={onNavigate}
        className="rounded-3xl border border-lokala-green-light bg-gradient-to-br from-lokala-green-soft to-lokala-green-light p-4 shadow-lokala-soft transition hover:-translate-y-0.5"
      >
        <p className="text-sm font-extrabold text-lokala-brown-dark">
          Own a local business?
        </p>
        <p className="mt-1 text-xs leading-5 text-lokala-brown">
          List it on Lokala and reach nearby customers.
        </p>
        <span className="mt-3 inline-block rounded-full bg-lokala-green px-3 py-1.5 text-xs font-bold text-white">
          Get started
        </span>
      </Link>
    </div>
  );
}
