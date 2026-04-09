import Link from "next/link";

import { BrandWordmark } from "@/components/brand-wordmark";
import RedeemButton from "@/components/coupons/redeem-button";
import RestaurantLogo from "@/components/restaurants/restaurant-logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

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

export default async function HomePage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16 sm:px-6">
        <p className="text-sm text-muted-foreground">Coupon marketplace</p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Save local with <BrandWordmark className="text-inherit" />
        </h1>
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Add{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            .env.local
          </code>{" "}
          to load coupons.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileRole: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    profileRole = profile?.role ?? null;
  }

  const { data: coupons, error: couponsError } = await supabase
    .from("coupons")
    .select(
      "id, title, description, expiration_at, restaurant_id, created_at, is_active, current_redemptions",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (couponsError) {
    console.error("Coupons query error:", couponsError);
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          <BrandWordmark className="text-inherit" /> Coupons
        </h1>
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error loading coupons: {couponsError.message}
        </p>
      </div>
    );
  }

  const restaurantIds = Array.from(
    new Set((coupons ?? []).map((coupon) => coupon.restaurant_id).filter(Boolean)),
  );

  let restaurantMap = new Map<string, Restaurant>();

  if (restaurantIds.length > 0) {
    const { data: restaurants, error: restaurantsError } = await supabase
      .from("restaurants")
      .select("id, name, logo_url")
      .in("id", restaurantIds);

    if (restaurantsError) {
      console.error("Restaurants query error:", restaurantsError);
      return (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            <BrandWordmark className="text-inherit" /> Coupons
          </h1>
          <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error loading restaurants: {restaurantsError.message}
          </p>
        </div>
      );
    }

    restaurantMap = new Map(
      ((restaurants ?? []) as Restaurant[]).map((restaurant) => [restaurant.id, restaurant]),
    );
  }

  const rows = (coupons ?? []) as Coupon[];

  return (
    <div className="w-full bg-background">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-18">
        <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_circle_at_20%_10%,rgba(30,144,214,0.14),transparent_60%),radial-gradient(900px_circle_at_80%_30%,rgba(143,224,195,0.18),transparent_55%)]" />
          <div className="relative px-6 py-12 sm:px-10 sm:py-14">
            <p className="text-sm font-medium text-primary/90">
              Local coupon marketplace
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-primary-dark sm:text-5xl">
              Premium local offers on <BrandWordmark className="text-inherit" />
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              <BrandWordmark className="text-base" /> helps customers save at
              {" "}nearby businesses and gives{" "}
              restaurant owners a simple way to publish high-quality offers.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button nativeButton={false} render={<Link href="/browse" />}>
                Browse coupons
              </Button>

              {!user ? (
                <Button
                  variant="outline"
                  className="border-primary/25 bg-white/60 text-primary hover:border-primary/45 hover:bg-white hover:text-primary-dark"
                  nativeButton={false}
                  render={<Link href="/login" />}
                >
                  Sign in
                </Button>
              ) : profileRole === "restaurant_owner" ? (
                <Button
                  variant="outline"
                  className="border-primary/25 bg-white/60 text-primary hover:border-primary/45 hover:bg-white hover:text-primary-dark"
                  nativeButton={false}
                  render={<Link href="/restaurant/dashboard" />}
                >
                  Dashboard
                </Button>
              ) : profileRole === "customer" ? (
                <Button
                  variant="outline"
                  className="border-primary/25 bg-white/60 text-primary hover:border-primary/45 hover:bg-white hover:text-primary-dark"
                  nativeButton={false}
                  render={<Link href="/my-redemptions" />}
                >
                  My Redemptions
                </Button>
              ) : null}
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-card/80 px-5 py-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">
                  For customers
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Discover active offers, redeem quickly, and keep spending
                  local.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/80 px-5 py-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">
                  For restaurant owners
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Publish and pause coupons, track redemptions, and stay in
                  control.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14 space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-primary-dark">
                Active coupons
              </h2>
              <p className="text-sm text-muted-foreground">
                Fresh offers from local businesses.
              </p>
            </div>
            <Link
              href="/browse"
              className="hidden text-sm font-medium text-primary hover:text-primary-dark sm:inline"
            >
              Browse all
            </Link>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active coupons right now.
            </p>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((coupon) => (
                <li
                  key={coupon.id}
                  className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <RestaurantLogo
                        logoUrl={restaurantMap.get(coupon.restaurant_id)?.logo_url ?? null}
                        name={restaurantMap.get(coupon.restaurant_id)?.name ?? "Restaurant"}
                      />
                      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {restaurantMap.get(coupon.restaurant_id)?.name ?? "Restaurant"}
                      </p>
                    </div>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                      Active
                    </span>
                  </div>

                  <h3 className="mt-2 line-clamp-2 text-lg font-semibold tracking-tight text-primary-dark">
                    {coupon.title}
                  </h3>

                  {coupon.description ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {coupon.description}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      A great local deal—redeem while it lasts.
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-4 text-xs text-muted-foreground">
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

                  <div className="mt-5">
                    <div className="transition-transform group-hover:translate-y-0">
                      <RedeemButton
                        couponId={coupon.id}
                        restaurantId={coupon.restaurant_id}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}