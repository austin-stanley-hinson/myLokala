import type { Metadata } from "next";
import Link from "next/link";

import { DealCard } from "@/components/catalog/deal-card";
import {
  CATALOG_CATEGORIES,
  filterDealsByCategory,
  isCatalogCategory,
  mapCatalogDealRow,
  type CatalogDealJoinRow,
} from "@/lib/catalog/browse-deals";
import { buildPageMetadata } from "@/lib/seo";
import { createTypedClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Local Deals | Lokala",
  description:
    "Browse local deals from Waterville-area businesses. Redeem in the Lokala mobile app.",
  path: "/browse",
});

/**
 * Public MMCC catalog marketplace. Browse-only: merchants do not create,
 * edit, or claim these deals during MVP, and there is no redeem action on
 * web -- redemption only exists in the mobile app. Reads go through the
 * anon-safe catalog_*_select_active RLS policies (migration
 * 20260901000019) via the cookie-bound anon-key client
 * (createTypedClient) -- no service-role client is used here, this is
 * public data.
 *
 * A business/location shared by more than one deal (Silver Street Tavern:
 * two legacy_deal_id rows, one address) renders as two separate cards --
 * nothing here groups or dedupes by business or location, matching the
 * underlying data (proven in browse-deals.test.ts).
 *
 * No pagination: 95 rows total in the current catalog renders fine as a
 * single list. Category filtering is a plain `?category=` query param
 * (server-rendered, no client-side state) rather than a client-side
 * search -- matching the requirement to support category filtering only,
 * not free-text search.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawCategory = params.category;
  const category = typeof rawCategory === "string" ? rawCategory : null;

  const supabase = await createTypedClient();
  const { data, error } = await supabase
    .from("catalog_deals")
    .select(
      "id, legacy_deal_id, title, subtitle, discount_detail, offer_type, percent_off, category, expires_at, " +
        "catalog_locations!inner(address, catalog_businesses!inner(business_name))",
    )
    .eq("status", "active")
    .order("category", { ascending: true })
    .order("title", { ascending: true })
    .returns<CatalogDealJoinRow[]>();

  const allDeals = (data ?? []).map(mapCatalogDealRow);
  const deals = filterDealsByCategory(allDeals, category);
  const activeCategory = category && isCatalogCategory(category) ? category : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Local deals
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Browse deals from local businesses
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-lokala-muted">
          Find a deal here, then open the Lokala mobile app to redeem it in store.
        </p>
      </header>

      <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
        <Link
          href="/browse"
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors",
            activeCategory === null
              ? "border-lokala-green bg-lokala-green-light text-lokala-green-dark"
              : "border-lokala-border bg-white text-lokala-brown hover:border-lokala-green",
          )}
        >
          All
        </Link>
        {CATALOG_CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={`/browse?category=${cat}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-bold capitalize transition-colors",
              activeCategory === cat
                ? "border-lokala-green bg-lokala-green-light text-lokala-green-dark"
                : "border-lokala-border bg-white text-lokala-brown hover:border-lokala-green",
            )}
          >
            {cat}
          </Link>
        ))}
      </nav>

      {error ? (
        <section className="rounded-3xl border border-dashed border-lokala-border bg-white p-8 shadow-lokala-card">
          <h2 className="text-lg font-extrabold text-lokala-brown-dark">
            Deals aren&apos;t available right now
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-lokala-muted">
            Please check back in a few minutes.
          </p>
        </section>
      ) : deals.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-lokala-border bg-white p-8 shadow-lokala-card">
          <h2 className="text-lg font-extrabold text-lokala-brown-dark">
            No deals in this category yet
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-lokala-muted">
            Try a different category, or view all deals.
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </ul>
      )}
    </div>
  );
}
