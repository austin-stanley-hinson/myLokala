"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";

/**
 * App-like dashboard layout: a persistent left sidebar, a top header, a main
 * content column, and an optional right rail.
 *
 * Responsive behavior:
 *  - Desktop (lg+): sticky sidebar + main (+ right rail on xl).
 *  - Tablet/mobile: sidebar collapses; the header exposes a menu button that
 *    opens the sidebar in a slide-over drawer. The right rail stacks under the
 *    main content below xl.
 *
 * Layout-only in Phase 1 — not yet wired into any page.
 */
export function DashboardShell({
  children,
  rightRail,
  userName,
  isSignedIn,
  isBusiness,
}: {
  children: ReactNode;
  rightRail?: ReactNode;
  userName?: string;
  isSignedIn?: boolean;
  isBusiness?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 sm:px-5 lg:px-6">
      <div className="flex gap-6">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 self-start overflow-y-auto rounded-3xl border border-lokala-border bg-white/80 shadow-lokala-card backdrop-blur lg:block">
          <DashboardSidebar />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6 py-4">
          <DashboardHeader
            userName={userName}
            isSignedIn={isSignedIn}
            isBusiness={isBusiness}
            onMenuClick={() => setMobileOpen(true)}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <main className="min-w-0">{children}</main>
            {rightRail ? <aside className="min-w-0">{rightRail}</aside> : null}
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] overflow-y-auto bg-white shadow-lokala-lift">
            <div className="flex justify-end p-2">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-2xl border border-lokala-border bg-white text-lokala-brown"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <DashboardSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
