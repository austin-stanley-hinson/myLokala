import { BrandWordmark } from "@/components/brand-wordmark";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardRightRail } from "@/components/dashboard/dashboard-right-rail";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HomeDealsSection } from "@/components/dashboard/home-deals-section";
import { createClient } from "@/lib/supabase/server";
import { DEAL_LIST_COLUMNS, type Deal } from "@/types/deal";

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
          Lokala always Local
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
    <DashboardShell
      userName={userName}
      rightRail={
        <DashboardRightRail
          savedCount={savedDealIds.size}
          isSignedIn={Boolean(user)}
        />
      }
    >
      <div className="flex flex-col gap-8">
        <DashboardHero images={HERO_IMAGES} />

        <HomeDealsSection
          deals={rows}
          savedDealIds={Array.from(savedDealIds)}
          categories={categories}
        />
      </div>
    </DashboardShell>
  );
}
