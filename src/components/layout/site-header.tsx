"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import type { AuthChangeEvent, User } from "@supabase/supabase-js";

import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navLinkClass =
  "whitespace-nowrap rounded-full px-3.5 py-2 text-base font-bold text-lokala-brown transition-colors hover:bg-white hover:text-lokala-green-dark sm:text-lg";

export function SiteHeader() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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

  return (
    <header className="sticky top-0 z-40 border-b border-lokala-border bg-lokala-cream-light/90 backdrop-blur-xl supports-[backdrop-filter]:bg-lokala-cream-light/80">
      <div className="mx-auto flex min-h-[4.5rem] max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3 sm:flex-nowrap sm:gap-x-6 sm:px-6 sm:py-0 sm:min-h-[5rem]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 rounded-2xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            {!logoError ? (
              <Image
                src="/lokala-logo.png"
                alt=""
                width={120}
                height={48}
                className="h-11 w-auto max-h-11 rounded-2xl bg-white object-contain object-left p-1 shadow-lokala-soft"
                priority
                onError={() => setLogoError(true)}
              />
            ) : null}
            <BrandWordmark className="text-2xl" />
          </Link>

          {ready && user ? (
            <nav
              className="flex flex-wrap items-center gap-x-1 gap-y-1"
              aria-label="Primary"
            >
              <Link href="/browse" className={navLinkClass}>
                Deals
              </Link>
              <Link href="/gift-certificates" className={navLinkClass}>
                Gift Certificates
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
              className="flex flex-wrap items-center gap-x-1 gap-y-1"
              aria-label="Primary"
            >
              <Link href="/browse" className={navLinkClass}>
                Deals
              </Link>
              <Link href="/gift-certificates" className={navLinkClass}>
                Gift Certificates
              </Link>
              <Link href="/signup" className={navLinkClass}>
                Businesses
              </Link>
            </nav>
          ) : null}
        </div>

        <div
          className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto"
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
                <span className="max-w-[10rem] truncate sm:max-w-[12rem]">
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
      </div>
    </header>
  );
}
