"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { CategoryNav } from "@/components/dashboard/category-nav";
import { DealCard } from "@/components/dashboard/deal-card";
import type { Deal } from "@/types/deal";

const ALL = "All";

/**
 * Client-side deals board for the homepage. Filtering runs purely over the
 * deals already loaded by the server page — no new query, no backend search.
 * Category chips and the popular-categories tiles both drive the same
 * in-memory filter.
 */
export function HomeDealsSection({
  deals,
  categories,
}: {
  deals: Deal[];
  categories: string[];
}) {
  const [active, setActive] = useState(ALL);

  const filtered = useMemo(
    () =>
      active === ALL
        ? deals
        : deals.filter((deal) => (deal.category?.trim() ?? "") === active),
    [active, deals],
  );

  // Popular categories with counts, from real deal data only.
  const popular = useMemo(() => {
    const counts = new Map<string, number>();
    for (const deal of deals) {
      const category = deal.category?.trim();
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [deals]);

  return (
    <section className="flex flex-col gap-6">
      {popular.length >= 2 ? (
        <div>
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
            Popular categories
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {popular.map(([name, count]) => {
              const isActive = name === active;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setActive(name)}
                  aria-pressed={isActive}
                  className={`flex flex-col rounded-2xl border p-3 text-left transition ${
                    isActive
                      ? "border-lokala-green bg-lokala-green-soft"
                      : "border-lokala-border bg-white hover:bg-lokala-cream"
                  }`}
                >
                  <span className="truncate text-sm font-extrabold text-lokala-brown-dark">
                    {name}
                  </span>
                  <span className="mt-0.5 text-xs font-semibold text-lokala-muted">
                    {count} {count === 1 ? "deal" : "deals"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
          Browse by category
        </h2>
        <CategoryNav
          categories={categories}
          activeCategory={active}
          onSelect={setActive}
        />
      </div>

      <div>
        <div className="mb-5 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
              Featured local deals
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-lokala-brown-dark sm:text-3xl">
              {active === ALL ? "Fresh offers from local businesses" : active}
            </h2>
          </div>
          <Link
            href="/browse"
            className="hidden whitespace-nowrap rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light sm:inline-block"
          >
            Browse all
          </Link>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-lokala-border bg-white p-10 text-center shadow-lokala-card">
            <p className="text-lg font-bold text-lokala-brown-dark">
              No deals in this category yet.
            </p>
            <button
              type="button"
              onClick={() => setActive(ALL)}
              className="mt-3 rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
            >
              Show all deals
            </button>
          </div>
        ) : (
          <ul className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
