"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, Home, Tag, type LucideIcon } from "lucide-react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon };

// Clickable items point ONLY at real, existing routes. The web app is public
// browsing + a merchant portal, so no customer-account entries (saved, profile,
// settings, redemptions) are surfaced here.
const PRIMARY_NAV: NavLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/browse", label: "Deals", icon: Tag },
  { href: "/gift-certificates", label: "Gift Certificates", icon: Gift },
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
        {/* Single mark — no nested white tile. Note: logo-try-1.png has a baked
            near-white background (RGB, not transparent). */}
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
