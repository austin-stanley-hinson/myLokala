"use client";

import { useMemo, useState } from "react";

type RedemptionItem = {
  id: string;
  restaurantName: string;
  couponTitle: string;
  redeemedAt: string | null;
};

type FilterKey = "24h" | "7d" | "all";

const filters: { key: FilterKey; label: string }[] = [
  { key: "24h", label: "Past 24 hours" },
  { key: "7d", label: "Past 7 days" },
  { key: "all", label: "All time" },
];

function matchesFilter(redeemedAt: string | null, filter: FilterKey) {
  if (filter === "all") return true;
  if (!redeemedAt) return false;

  const redeemedTime = new Date(redeemedAt).getTime();
  if (Number.isNaN(redeemedTime)) return false;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const windowMs = filter === "24h" ? dayMs : 7 * dayMs;

  return now - redeemedTime <= windowMs;
}

export default function RedemptionsHistory({
  items,
}: {
  items: RedemptionItem[];
}) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const filteredItems = useMemo(
    () => items.filter((item) => matchesFilter(item.redeemedAt, activeFilter)),
    [items, activeFilter],
  );

  return (
    <section className="mt-10 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveFilter(filter.key)}
            className={
              activeFilter === filter.key
                ? "rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-xl border border-border/70 bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No redemptions match this filter yet.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.restaurantName}
              </p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-primary-dark">
                {item.couponTitle}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Redeemed{" "}
                {item.redeemedAt
                  ? new Date(item.redeemedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
