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
  "text-sm font-medium text-foreground/80 transition-colors hover:text-primary-dark";

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

  const menuLinkClass =
    "block w-full px-3 py-2 text-left text-sm text-primary hover:bg-muted hover:text-primary-dark";
  const menuItemClass =
    "block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted";
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/lokala-logo.png"
              alt="Lokala"
              width={120}
              height={36}
              className="h-9 w-auto max-h-9 rounded-md bg-transparent object-contain object-left p-1 dark:bg-white/10"
              priority
            />
            <BrandWordmark className="text-lg" />
          </Link>

          <nav
            className="flex items-center gap-6"
            aria-label="Primary"
          >
            <Link href="/" className={navLinkClass}>
              Home
            </Link>
            <Link href="/browse" className={navLinkClass}>
              Browse
            </Link>
          </nav>
        </div>

        <div
          className="flex shrink-0 items-center gap-2"
          aria-busy={!ready}
          aria-label="Account"
        >
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "rounded-full hover:bg-muted",
            )}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <Sun className="size-5" aria-hidden />
            ) : (
              <Moon className="size-5" aria-hidden />
            )}
          </button>

          {!ready ? (
            <div className="flex items-center" aria-hidden>
              <span className="inline-block h-8 w-[5.5rem] animate-pulse rounded-lg bg-muted" />
            </div>
          ) : !user ? (
            <Link href="/login" className={cn(buttonVariants())}>
              Sign in
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
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "rounded-full hover:bg-muted",
                )}
              >
                <UserRound className="size-5" aria-hidden />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-border bg-card py-1 shadow-md"
                >
                  {role === "restaurant_owner" ? (
                    <Link
                      href="/restaurant/dashboard"
                      role="menuitem"
                      className={menuLinkClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                  ) : null}
                  {role === "customer" ? (
                    <Link
                      href="/my-redemptions"
                      role="menuitem"
                      className={menuLinkClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      My Redemptions
                    </Link>
                  ) : null}
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
