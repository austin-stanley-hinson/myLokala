"use client";

import { cn } from "@/lib/utils";

/**
 * Horizontal, scrollable category chips. Presentational and data-driven — the
 * caller passes the category labels (which should be derived from real
 * `deals.category` values, plus an "All" option). Selection is optional so this
 * can render as static chips or drive client-side filtering later.
 */
export function CategoryNav({
  categories,
  activeCategory,
  onSelect,
  className,
}: {
  categories: string[];
  activeCategory?: string;
  onSelect?: (category: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Deal categories"
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {categories.map((category) => {
        const active = category === activeCategory;
        return (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onSelect ? () => onSelect(category) : undefined}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition",
              active
                ? "border-lokala-green bg-lokala-green text-white shadow-lokala-soft"
                : "border-lokala-border bg-white text-lokala-brown hover:bg-lokala-green-light hover:text-lokala-green-dark",
            )}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
