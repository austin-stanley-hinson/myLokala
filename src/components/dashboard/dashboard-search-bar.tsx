"use client";

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Visual search field for the dashboard header. Presentational only — there is
 * no search backend wired yet, so it does not submit or filter anything. A
 * future phase can lift value/onChange up to drive client-side filtering over
 * already-loaded data.
 */
export function DashboardSearchBar({
  className,
  placeholder = "Search local deals, businesses, or gift certificates…",
}: {
  className?: string;
  placeholder?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 w-full items-center gap-3 rounded-full border border-lokala-border bg-white px-4 shadow-sm focus-within:border-lokala-green focus-within:ring-4 focus-within:ring-lokala-green-light",
        className,
      )}
    >
      <Search className="size-5 shrink-0 text-lokala-muted" aria-hidden />
      <input
        type="search"
        aria-label="Search"
        placeholder={placeholder}
        className="w-full bg-transparent text-base text-lokala-text outline-none placeholder:text-lokala-muted"
      />
    </div>
  );
}
