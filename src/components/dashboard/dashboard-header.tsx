"use client";

import { Bell, MapPin, Menu, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { DashboardSearchBar } from "./dashboard-search-bar";

function getInitials(name?: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

/**
 * Top dashboard header: mobile menu button, visual search, and account cluster.
 *
 * Placeholders (no backend yet, purely visual): the location chip is static
 * ("Waterville, ME"), the notifications button is disabled, and the avatar
 * shows initials (or a generic icon) since profiles have no photo column.
 */
export function DashboardHeader({
  userName,
  onMenuClick,
  className,
}: {
  userName?: string;
  onMenuClick?: () => void;
  className?: string;
}) {
  const initials = getInitials(userName);

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
        {/* Placeholder: static location, no selector backend yet. */}
        <span className="hidden items-center gap-1.5 rounded-full border border-lokala-border bg-white px-3 py-2 text-sm font-bold text-lokala-brown md:inline-flex">
          <MapPin className="size-4 text-lokala-green-dark" aria-hidden />
          Waterville, ME
        </span>

        {/* Placeholder: notifications not wired to any backend. */}
        <button
          type="button"
          disabled
          aria-label="Notifications (coming soon)"
          title="Coming soon"
          className="inline-flex size-11 items-center justify-center rounded-2xl border border-lokala-border bg-white text-lokala-muted shadow-sm"
        >
          <Bell className="size-5" aria-hidden />
        </button>

        {/* Placeholder avatar: initials from name, or a generic icon. No photo
            column exists on profiles, so uploads are out of scope for now. */}
        <div
          className="inline-flex size-11 items-center justify-center rounded-full bg-lokala-green-light text-sm font-extrabold text-lokala-green-dark"
          aria-hidden
        >
          {initials || <UserRound className="size-5" />}
        </div>
      </div>
    </header>
  );
}
