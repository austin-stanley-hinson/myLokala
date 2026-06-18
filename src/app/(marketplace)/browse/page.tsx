import RedeemDealButton from "@/components/deals/redeem-deal-button";
import SaveDealButton from "@/components/deals/save-deal-button";
import { createClient } from "@/lib/supabase/server";
import { DEAL_LIST_COLUMNS, type Deal } from "@/types/deal";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-18">
        <p className="text-sm text-muted-foreground">
          Configure Supabase environment variables to load this page.
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
    .order("created_at", { ascending: false });

  if (dealsError) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-18">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">
          Browse deals
        </h1>
        <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load deals: {dealsError.message}
        </p>
      </div>
    );
  }

  const rows = (deals ?? []) as Deal[];

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

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-18">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-dark sm:text-4xl">
          Browse deals
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Explore active local offers from nearby businesses.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          No active deals right now.
        </p>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((deal) => (
            <li
              key={deal.id}
              className="flex flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-muted-foreground">
                    {deal.business_name ?? "Local business"}
                  </p>
                  {deal.category ? (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-lokala-green-dark">
                      {deal.category}
                    </p>
                  ) : null}
                </div>
                <SaveDealButton
                  dealId={deal.id}
                  initialSaved={savedDealIds.has(deal.id)}
                />
              </div>

              <h2 className="mt-3 line-clamp-2 text-xl font-semibold text-primary-dark">
                {deal.title}
              </h2>
              <p className="mt-2 line-clamp-3 text-base leading-relaxed text-muted-foreground">
                {deal.discount_detail ??
                  "A great local offer—redeem while it lasts."}
              </p>

              <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted-foreground">
                <p>
                  Expires{" "}
                  {deal.expires_at
                    ? new Date(deal.expires_at).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })
                    : "—"}
                </p>
              </div>

              <div className="mt-5 pt-1">
                <RedeemDealButton deal={deal} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
