import Link from "next/link";

import { BrandWordmark } from "@/components/brand-wordmark";
import RedeemDealButton from "@/components/deals/redeem-deal-button";
import SaveDealButton from "@/components/deals/save-deal-button";
import { CategoryNav } from "@/components/dashboard/category-nav";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createClient } from "@/lib/supabase/server";
import { DEAL_LIST_COLUMNS, formatExpiry, type Deal } from "@/types/deal";

export const dynamic = "force-dynamic";

// Existing Waterville/local imagery in /public, reused for the hero carousel.
const HERO_IMAGES = [
  "/w3.avif",
  "/w4.jpg",
  "/w5.jpg",
  "/w6.jpg",
  "/w7.jpg",
  "/w8.jpg",
  "/w9.jpg",
  "/w10.jpg",
  "/w11.jpg",
  "/w12.jpg",
];

export default async function HomePage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Local community marketplace
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-lokala-brown-dark">
          Local deals, rooted in your community.
        </h1>
        <p className="rounded-3xl border border-lokala-border bg-white px-5 py-4 text-sm text-lokala-muted shadow-lokala-card">
          Add{" "}
          <code className="rounded bg-lokala-green-light px-1.5 py-0.5 text-xs text-lokala-green-dark">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-lokala-green-light px-1.5 py-0.5 text-xs text-lokala-green-dark">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to{" "}
          <code className="rounded bg-lokala-green-light px-1.5 py-0.5 text-xs text-lokala-green-dark">
            .env.local
          </code>{" "}
          to load deals.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: deals, error: dealsError } = await supabase
    .from("deals")
    .select(DEAL_LIST_COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  if (dealsError) {
    console.error("Deals query error:", dealsError);
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          <BrandWordmark className="text-inherit" /> Deals
        </h1>
        <p className="rounded-2xl border border-lokala-danger/30 bg-lokala-danger/5 px-4 py-3 text-sm text-lokala-danger">
          Error loading deals: {dealsError.message}
        </p>
      </div>
    );
  }

  const rows = (deals ?? []) as Deal[];

  // Mark which of these deals the signed-in user has already saved.
  let savedDealIds = new Set<string>();
  if (user && rows.length > 0) {
    const { data: saved } = await supabase
      .from("saved_deals")
      .select("deal_id")
      .eq("user_id", user.id)
      .in(
        "deal_id",
        rows.map((deal) => deal.id),
      );
    savedDealIds = new Set((saved ?? []).map((row) => row.deal_id as string));
  }

  // Category chips derived from the actual category values on the loaded deals
  // (no invented taxonomy), with an "All" option first.
  const distinctCategories = Array.from(
    new Set(
      rows
        .map((deal) => deal.category?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const categories = ["All", ...distinctCategories];

  const userName = user?.user_metadata?.full_name as string | undefined;

  return (
    <DashboardShell userName={userName}>
      <div className="flex flex-col gap-8">
        <DashboardHero images={HERO_IMAGES} />

        <div>
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
            Browse by category
          </h2>
          <CategoryNav categories={categories} activeCategory="All" />
        </div>

        {/* Featured local deals — existing card markup retained; the deal card
            redesign is deferred to Phase 3. */}
        <section>
          <div className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
                Featured local deals
              </p>
              <h2 className="mt-1 text-2xl font-extrabold text-lokala-brown-dark sm:text-3xl">
                Fresh offers from local businesses
              </h2>
            </div>
            <Link
              href="/browse"
              className="hidden whitespace-nowrap rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light sm:inline-block"
            >
              Browse all
            </Link>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-3xl border border-lokala-border bg-white p-10 text-center shadow-lokala-card">
              <p className="text-lg font-bold text-lokala-brown-dark">
                No active deals right now.
              </p>
              <p className="mt-2 text-sm text-lokala-muted">
                Check back soon — new local offers are added regularly.
              </p>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((deal) => (
                <li
                  key={deal.id}
                  className="group flex flex-col rounded-[2rem] border border-lokala-border bg-white p-5 shadow-lokala-card transition duration-200 hover:-translate-y-1 hover:shadow-lokala-lift"
                >
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-[1.5rem] bg-lokala-green-soft px-4 py-4">
                    <p className="truncate text-sm font-bold text-lokala-brown-dark">
                      {deal.business_name ?? "Local business"}
                    </p>
                    <span className="shrink-0 rounded-full bg-lokala-green-light px-3 py-1 text-xs font-extrabold text-lokala-green-dark">
                      Active
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-lokala-green-dark">
                      {deal.category ?? "Local offer"}
                    </p>
                    <SaveDealButton
                      dealId={deal.id}
                      initialSaved={savedDealIds.has(deal.id)}
                    />
                  </div>
                  <h3 className="mt-1 line-clamp-2 text-xl font-extrabold text-lokala-brown-dark">
                    {deal.title}
                  </h3>

                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-lokala-muted">
                    {deal.discount_detail ??
                      "A great local offer — redeem while it lasts."}
                  </p>

                  <div className="mt-4 flex items-center justify-end gap-4 text-xs font-semibold text-lokala-muted">
                    <span>{formatExpiry(deal.expires_at)}</span>
                  </div>

                  <div className="mt-5 pt-1">
                    <RedeemDealButton deal={deal} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
