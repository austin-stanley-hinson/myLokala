import { redirect } from "next/navigation";

import RedemptionsHistory from "@/components/redemptions/redemptions-history";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RedemptionRow = {
  redeemed_at: string | null;
  coupons: { title: string } | { title: string }[] | null;
  restaurants: { name: string } | { name: string }[] | null;
};

function firstRelation<T extends { title?: string; name?: string }>(
  rel: T | T[] | null,
): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function MyRedemptionsPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
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

  if (!user) {
    redirect("/login");
  }

  const { data: rows, error } = await supabase
    .from("redemptions")
    .select(
      `
      redeemed_at,
      coupons (
        title
      ),
      restaurants (
        name
      )
    `,
    )
    .eq("user_id", user.id)
    .order("redeemed_at", { ascending: false });

  const list = (rows ?? []) as RedemptionRow[];
  const items = list.map((row, index) => {
    const coupon = firstRelation(row.coupons);
    const restaurant = firstRelation(row.restaurants);

    return {
      id: `${row.redeemed_at ?? "row"}-${index}`,
      restaurantName: restaurant?.name ?? "Restaurant",
      couponTitle: coupon?.title ?? "Coupon",
      redeemedAt: row.redeemed_at,
    };
  });

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-18">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-dark sm:text-4xl">
          My Redemptions
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Review your coupon redemption history.
        </p>
      </div>

      {error ? (
        <p className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load redemptions: {error.message}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          You have not redeemed any coupons yet.
        </p>
      ) : (
        <RedemptionsHistory items={items} />
      )}
    </div>
  );
}
