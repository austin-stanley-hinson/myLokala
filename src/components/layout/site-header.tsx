"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  KeyRound,
  LogOut,
  MapPin,
  Menu,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AuthChangeEvent, User } from "@supabase/supabase-js";

import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { createClient, createTypedClient } from "@/lib/supabase/client";
import { isActiveMerchantMember } from "@/lib/auth/merchant";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

const desktopLinkClass =
  "whitespace-nowrap rounded-full px-3.5 py-2 text-base font-bold text-lokala-brown transition-colors hover:bg-white hover:text-lokala-green-dark lg:text-lg";

const mobileLinkClass =
  "block rounded-2xl px-4 py-3 text-lg font-bold text-lokala-brown transition-colors hover:bg-lokala-green-light hover:text-lokala-green-dark";

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [businessOwner, setBusinessOwner] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleMouseDown(event: MouseEvent) {
      const el = menuContainerRef.current;
      if (!el || !(event.target instanceof Node)) return;
      if (!el.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [menuOpen]);

  // Close the mobile panel on Escape.
  useEffect(() => {
    if (!mobileOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function initFromGetUser() {
      const {
        data: { user: initialUser },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      setUser(initialUser ?? null);
      setReady(true);
    }

    void initFromGetUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session) => {
        if (cancelled) return;

        if (event === "INITIAL_SESSION") return;

        const nextUser = session?.user ?? null;
        setUser(nextUser);

        if (!nextUser) {
          setBusinessOwner(false);
          setMenuOpen(false);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Resolve merchant access from an active `merchant_members` row (the
  // authorization source of truth). No metadata optimism — membership only.
  // Clearing on sign-out is handled in the auth-state listener above so this
  // effect never sets state synchronously during commit.
  useEffect(() => {
    if (!user) return;

    const supabase = createTypedClient();
    let cancelled = false;
    void isActiveMerchantMember(supabase, user.id).then((result) => {
      if (!cancelled) setBusinessOwner(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSignOut() {
    setMenuOpen(false);
    setMobileOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const menuItemClass =
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-bold text-lokala-brown transition-colors hover:bg-lokala-green-light hover:text-lokala-green-dark";

  // Primary nav links, derived from auth state (shared by desktop + mobile).
  // Signed-in business owners get the B2B navigation into the dashboard
  // sections; everyone else sees the customer-facing marketplace links.
  const isBusinessNav = ready && businessOwner;

  const navItems: NavItem[] = isBusinessNav
    ? [
        { href: "/business", label: "Dashboard" },
        { href: "/business/profile", label: "Profile" },
        { href: "/business/locations", label: "Locations" },
      ]
    : [
        // Deal discovery and web gift purchasing are quarantined for the
        // gift-balance MVP, so they're intentionally omitted from navigation.
        { href: "/", label: "Home" },
        { href: "/signup", label: "For Businesses" },
      ];

  // The web app is public browsing + a merchant portal — no customer account
  // UX. Only business owners get account links; any non-business signed-in user
  // sees a minimal menu (a note pointing to the mobile app + sign out).
  type AccountItem = { href: string; label: string; icon: LucideIcon };
  const accountMenuItems: AccountItem[] = businessOwner
    ? [
        { href: "/business/profile", label: "Profile", icon: UserRound },
        { href: "/business/locations", label: "Locations", icon: MapPin },
        { href: "/forgot-password", label: "Change password", icon: KeyRound },
      ]
    : [];

  // A link is active on its exact route; section roots like "/" and "/business"
  // stay exact so they don't light up on their nested pages.
  const isActive = (href: string) => {
    if (href === "/" || href === "/business") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-lokala-border bg-lokala-cream-light/90 backdrop-blur-xl supports-[backdrop-filter]:bg-lokala-cream-light/80">
      <div className="mx-auto flex min-h-[4.25rem] max-w-7xl items-center justify-between gap-x-4 px-4 sm:px-6 sm:min-h-[5rem]">
        {/* Logo + wordmark */}
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="flex shrink-0 items-center gap-2.5 rounded-2xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          {!logoError ? (
            <Image
              src="/logo-try-1.png"
              alt=""
              width={44}
              height={44}
              className="size-10 shrink-0 object-contain sm:size-11"
              priority
              onError={() => setLogoError(true)}
            />
          ) : null}
          <BrandWordmark className="text-xl sm:text-2xl" />
        </Link>

        {/* Desktop nav */}
        {ready ? (
          <nav
            className="hidden items-center gap-x-1 lg:flex"
            aria-label="Primary"
          >
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    desktopLinkClass,
                    active &&
                      "bg-white text-lokala-green-dark shadow-lokala-soft",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {/* Desktop account / auth */}
        <div
          className="hidden shrink-0 items-center gap-2 lg:flex"
          aria-busy={!ready}
          aria-label="Account"
        >
          {!ready ? (
            <span
              className="inline-block h-10 min-w-[6rem] animate-pulse rounded-full bg-muted"
              aria-hidden
            />
          ) : !user ? (
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-10 rounded-full px-5 text-sm font-bold shadow-lokala-soft",
              )}
            >
              Business Sign In
            </Link>
          ) : (
            <div ref={menuContainerRef} className="relative">
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
                onClick={() => setMenuOpen((open) => !open)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "inline-flex h-10 items-center gap-2 rounded-full border-lokala-border bg-white px-4 text-base font-bold text-lokala-brown shadow-sm hover:bg-lokala-brown-soft",
                )}
              >
                <UserRound className="size-4 shrink-0" aria-hidden />
                <span className="max-w-[10rem] truncate xl:max-w-[12rem]">
                  Account
                </span>
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 min-w-[13rem] overflow-hidden rounded-2xl border border-lokala-border bg-white py-1 shadow-lokala-card"
                >
                  {!businessOwner ? (
                    <p className="px-4 py-3 text-xs font-semibold leading-5 text-lokala-muted">
                      Customer features are available in the Lokala app.
                    </p>
                  ) : null}
                  {accountMenuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className={menuItemClass}
                      >
                        <Icon
                          className="size-4 shrink-0 text-lokala-green-dark"
                          aria-hidden
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                  <div className="my-1 border-t border-lokala-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    className={menuItemClass}
                  >
                    <LogOut
                      className="size-4 shrink-0 text-lokala-green-dark"
                      aria-hidden
                    />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-lokala-border bg-white text-lokala-brown shadow-sm transition-colors hover:bg-lokala-brown-soft lg:hidden"
        >
          {mobileOpen ? (
            <X className="size-6" aria-hidden />
          ) : (
            <Menu className="size-6" aria-hidden />
          )}
        </button>
      </div>

      {/* Mobile panel */}
      {mobileOpen ? (
        <div
          id="mobile-nav"
          className="border-t border-lokala-border bg-lokala-cream-light lg:hidden"
        >
          <nav
            className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6"
            aria-label="Primary"
          >
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    mobileLinkClass,
                    active && "bg-lokala-green-light text-lokala-green-dark",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-2 flex flex-col gap-2 border-t border-lokala-border pt-3">
              {!ready ? (
                <span
                  className="h-12 w-full animate-pulse rounded-full bg-muted"
                  aria-hidden
                />
              ) : !user ? (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="w-full rounded-full bg-lokala-green px-5 py-3.5 text-center text-base font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
                >
                  Business Sign In
                </Link>
              ) : (
                <>
                  <Link
                    href="/forgot-password"
                    onClick={() => setMobileOpen(false)}
                    className="w-full rounded-full border border-lokala-border bg-white px-5 py-3 text-center text-base font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
                  >
                    Change password
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="w-full rounded-full border border-lokala-border bg-white px-5 py-3 text-center text-base font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
                  >
                    Sign out
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
