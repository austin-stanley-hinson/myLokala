"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { DashboardSearchBar } from "./dashboard-search-bar";

function getInitials(name?: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

/**
 * Top dashboard header for the public site.
 *
 * The web app is public browsing + a merchant portal — it does NOT offer a
 * customer login/account experience. So the account cluster only ever shows
 * business-focused actions:
 *  - signed out: "Business sign in" (/login) + "List your business" (/signup)
 *  - business owner: account menu into the existing /business areas + sign out
 *  - a non-business user (edge case): minimal menu — a note that customer
 *    features live in the Lokala app, plus sign out
 *
 * No notification bell (no backend, not a customer portal). The location chip
 * is static, informational context only.
 */
export function DashboardHeader({
  userName,
  isSignedIn = false,
  isBusiness = false,
  onMenuClick,
  className,
}: {
  userName?: string;
  isSignedIn?: boolean;
  isBusiness?: boolean;
  onMenuClick?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = getInitials(userName);

  useEffect(() => {
    if (!menuOpen) return;
    function handleMouseDown(event: MouseEvent) {
      const el = menuRef.current;
      if (!el || !(event.target instanceof Node)) return;
      if (!el.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [menuOpen]);

  async function handleSignOut() {
    setMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const menuItemClass =
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-bold text-lokala-brown transition-colors hover:bg-lokala-green-light hover:text-lokala-green-dark";

  return (
    <header className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl border border-lokala-border bg-white text-lokala-brown shadow-sm transition-colors hover:bg-lokala-brown-soft lg:hidden"
      >
        <Menu className="size-6" aria-hidden />
      </button>

      <div className="hidden min-w-0 flex-1 sm:block">
        <DashboardSearchBar />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Static, informational location context (no selector backend). */}
        <span className="hidden items-center gap-1.5 rounded-full border border-lokala-border bg-white px-3 py-2 text-sm font-bold text-lokala-brown md:inline-flex">
          <MapPin className="size-4 text-lokala-green-dark" aria-hidden />
          Waterville, ME
        </span>

        {!isSignedIn ? (
          <>
            <Link
              href="/signup"
              className="hidden rounded-full border border-lokala-border bg-white px-4 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light sm:inline-block"
            >
              List your business
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-lokala-green px-4 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark"
            >
              Business sign in
            </Link>
          </>
        ) : (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex size-11 items-center justify-center rounded-full bg-lokala-green-light text-sm font-extrabold text-lokala-green-dark transition hover:bg-lokala-green-soft"
            >
              {initials || <UserRound className="size-5" aria-hidden />}
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 min-w-[14rem] overflow-hidden rounded-2xl border border-lokala-border bg-white py-1 shadow-lokala-card"
              >
                {isBusiness ? (
                  <>
                    <Link
                      href="/business"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={menuItemClass}
                    >
                      <LayoutDashboard
                        className="size-4 shrink-0 text-lokala-green-dark"
                        aria-hidden
                      />
                      Business dashboard
                    </Link>
                    <Link
                      href="/business/profile"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={menuItemClass}
                    >
                      <UserRound
                        className="size-4 shrink-0 text-lokala-green-dark"
                        aria-hidden
                      />
                      Business profile
                    </Link>
                    <Link
                      href="/business/payments"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={menuItemClass}
                    >
                      <CreditCard
                        className="size-4 shrink-0 text-lokala-green-dark"
                        aria-hidden
                      />
                      Payments
                    </Link>
                  </>
                ) : (
                  <p className="px-4 py-3 text-xs font-semibold leading-5 text-lokala-muted">
                    Customer features are available in the Lokala app.
                  </p>
                )}

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
    </header>
  );
}
