"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, UserRound, X } from "lucide-react";
import type { AuthChangeEvent, User } from "@supabase/supabase-js";

import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

const desktopLinkClass =
  "whitespace-nowrap rounded-full px-3.5 py-2 text-base font-bold text-lokala-brown transition-colors hover:bg-white hover:text-lokala-green-dark lg:text-lg";

const mobileLinkClass =
  "block rounded-2xl px-4 py-3 text-lg font-bold text-lokala-brown transition-colors hover:bg-lokala-green-light hover:text-lokala-green-dark";

export function SiteHeader() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
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
          setMenuOpen(false);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setMenuOpen(false);
    setMobileOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const menuItemClass =
    "block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted";

  // Primary nav links, derived from auth state (shared by desktop + mobile).
  const navItems: NavItem[] = [
    { href: "/browse", label: "Deals" },
    { href: "/gift-certificates", label: "Gift Certificates" },
  ];
  if (ready && !user) {
    navItems.push({ href: "/signup", label: "Businesses" });
  }
  if (ready && user) {
    navItems.push({ href: "/my-redemptions", label: "My Redemptions" });
  }

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
              src="/lokala-logo.png"
              alt=""
              width={120}
              height={48}
              className="h-10 w-auto max-h-10 rounded-2xl bg-white object-contain object-left p-1 shadow-lokala-soft sm:h-11 sm:max-h-11"
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
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={desktopLinkClass}>
                {item.label}
              </Link>
            ))}
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
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "h-10 rounded-full px-4 text-base font-bold text-lokala-brown hover:bg-white hover:text-lokala-green-dark",
                )}
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "h-10 rounded-full px-5 text-sm font-bold shadow-lokala-soft",
                )}
              >
                Sign Up
              </Link>
            </>
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
                  className="absolute right-0 top-full z-50 mt-2 min-w-[12rem] rounded-2xl border border-lokala-border bg-card py-1 shadow-lokala-card"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    className={menuItemClass}
                  >
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
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={mobileLinkClass}
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-2 flex flex-col gap-2 border-t border-lokala-border pt-3">
              {!ready ? (
                <span
                  className="h-12 w-full animate-pulse rounded-full bg-muted"
                  aria-hidden
                />
              ) : !user ? (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="w-full rounded-full bg-lokala-green px-5 py-3.5 text-center text-base font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
                  >
                    Sign In
                  </Link>
                  <p className="pt-1 text-center text-sm font-semibold text-lokala-muted">
                    Don&apos;t have an account?{" "}
                    <Link
                      href="/signup"
                      onClick={() => setMobileOpen(false)}
                      className="font-bold text-lokala-green-dark underline-offset-4 hover:underline"
                    >
                      Click here
                    </Link>
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full rounded-full border border-lokala-border bg-white px-5 py-3 text-center text-base font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
                >
                  Sign out
                </button>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
