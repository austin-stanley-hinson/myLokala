import { createClient } from "@/lib/supabase/server";
import RestaurantLogo from "@/components/restaurants/restaurant-logo";

type Coupon = {
  id: string;
  title: string;
  description: string | null;
  expiration_at: string | null;
  restaurant_id: string;
  created_at: string | null;
  is_active: boolean | null;
  current_redemptions: number | null;
};

type Restaurant = {
  id: string;
  name: string;
  logo_url: string | null;
};

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
  const { data: coupons, error: couponsError } = await supabase
    .from("coupons")
    .select(
      "id, title, description, expiration_at, restaurant_id, created_at, is_active, current_redemptions",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (couponsError) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-18">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">
          Browse coupons
        </h1>
        <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load coupons: {couponsError.message}
        </p>
      </div>
    );
  }

  const rows = (coupons ?? []) as Coupon[];
  const restaurantIds = Array.from(
    new Set(rows.map((coupon) => coupon.restaurant_id).filter(Boolean)),
  );

  let restaurantMap = new Map<string, Restaurant>();
  if (restaurantIds.length > 0) {
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("id, name, logo_url")
      .in("id", restaurantIds);

    restaurantMap = new Map(
      ((restaurants ?? []) as Restaurant[]).map((restaurant) => [restaurant.id, restaurant]),
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-18">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-dark sm:text-4xl">
          Browse coupons
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Explore active local offers from nearby restaurants.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          No active coupons right now.
        </p>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((coupon) => (
            <li
              key={coupon.id}
              className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <RestaurantLogo
                  logoUrl={restaurantMap.get(coupon.restaurant_id)?.logo_url ?? null}
                  name={restaurantMap.get(coupon.restaurant_id)?.name ?? "Restaurant"}
                />
                <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {restaurantMap.get(coupon.restaurant_id)?.name ?? "Restaurant"}
                </p>
              </div>
              <h2 className="mt-2 line-clamp-2 text-lg font-semibold tracking-tight text-primary-dark">
                {coupon.title}
              </h2>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {coupon.description ?? "A great local deal—redeem while it lasts."}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <p>{coupon.current_redemptions ?? 0} redemptions</p>
                <p>
                  Expires{" "}
                  {coupon.expiration_at
                    ? new Date(coupon.expiration_at).toLocaleDateString(
                        undefined,
                        { dateStyle: "medium" },
                      )
                    : "—"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
