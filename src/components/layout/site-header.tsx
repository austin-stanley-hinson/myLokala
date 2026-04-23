"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import type { AuthChangeEvent, User } from "@supabase/supabase-js";

import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navLinkClass =
  "whitespace-nowrap text-sm font-medium text-foreground/85 transition-colors hover:text-primary";

export function SiteHeader() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function fetchProfile(userId: string) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (!cancelled) {
        setRole(profile?.role ?? null);
      }
    }

    async function initFromGetUser() {
      const {
        data: { user: initialUser },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!initialUser) {
        setUser(null);
        setRole(null);
        setReady(true);
        return;
      }

      setUser(initialUser);
      await fetchProfile(initialUser.id);
      if (!cancelled) setReady(true);
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
          setRole(null);
          setMenuOpen(false);
          return;
        }

        setRole(null);
        void fetchProfile(nextUser.id);
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const menuItemClass =
    "block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted";

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-0 sm:h-16">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/lokala-logo.png"
              alt="myLokala"
              width={120}
              height={36}
              className="h-9 w-auto max-h-9 rounded-md bg-transparent object-contain object-left p-1 dark:bg-white/10"
              priority
            />
            <BrandWordmark className="text-lg" />
          </Link>

          {ready && user ? (
            <nav
              className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-6"
              aria-label="Primary"
            >
              <Link href="/" className={navLinkClass}>
                Home
              </Link>
              <Link href="/" className={navLinkClass}>
                Browse Coupons
              </Link>
              {role === "customer" ? (
                <Link href="/my-redemptions" className={navLinkClass}>
                  My Redemptions
                </Link>
              ) : null}
              {role === "restaurant_owner" ? (
                <Link href="/restaurant/dashboard" className={navLinkClass}>
                  Dashboard
                </Link>
              ) : null}
            </nav>
          ) : ready && !user ? (
            <nav
              className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-5"
              aria-label="Primary"
            >
              <Link href="/" className={navLinkClass}>
                Browse Coupons
              </Link>
              <Link href="/signup" className={navLinkClass}>
                For Businesses
              </Link>
            </nav>
          ) : null}
        </div>

        <div
          className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto"
          aria-busy={!ready}
          aria-label="Account and appearance"
        >
          {!mounted ? (
            <span
              className="inline-flex h-9 min-w-[7.5rem] items-center justify-center rounded-xl border border-border/60 bg-muted/50 px-3 text-xs text-muted-foreground"
              aria-hidden
            >
              Theme…
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "inline-flex h-9 items-center gap-2 rounded-xl border-border/80 bg-card/90 px-3 text-sm font-medium shadow-sm hover:bg-muted",
              )}
              aria-label={
                isDark
                  ? "Switch to light theme. Currently using dark theme."
                  : "Switch to dark theme. Currently using light theme."
              }
              aria-pressed={isDark}
            >
              {isDark ? (
                <Sun className="size-4 shrink-0 text-amber-500" aria-hidden />
              ) : (
                <Moon className="size-4 shrink-0 text-primary" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {isDark ? "Light mode" : "Dark mode"}
              </span>
              <span className="sm:hidden">{isDark ? "Light" : "Dark"}</span>
            </button>
          )}

          {!ready ? (
            <span
              className="inline-block h-9 min-w-[6rem] animate-pulse rounded-xl bg-muted"
              aria-hidden
            />
          ) : !user ? (
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-sm font-medium",
                )}
              >
                Sign In
              </Link>
              <Link href="/signup" className={cn(buttonVariants({ size: "sm" }))}>
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
                  "inline-flex h-9 items-center gap-2 rounded-xl border-border/80 bg-card/90 px-3 text-sm font-medium shadow-sm hover:bg-muted",
                )}
              >
                <UserRound className="size-4 shrink-0" aria-hidden />
                <span className="max-w-[10rem] truncate sm:max-w-[12rem]">
                  Account
                </span>
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-xl border border-border bg-card py-1 shadow-md"
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
      </div>
    </header>
  );
}
