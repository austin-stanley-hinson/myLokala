import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandWordmark } from "@/components/brand-wordmark";
import { CouponActiveToggle } from "@/components/coupons/coupon-active-toggle";
import RestaurantLogoUpload from "@/components/restaurants/logo-upload";
import RestaurantLogo from "@/components/restaurants/restaurant-logo";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const shellClass =
  "mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8";

export default async function RestaurantDashboardPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className={shellClass}>
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

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, name, logo_url")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (restaurantError) {
    return (
      <div className={shellClass}>
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load your restaurant. Check RLS policies and the
          restaurants table.
        </p>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className={shellClass}>
        <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">
          <BrandWordmark className="text-inherit" /> Merchant Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Manage your coupons and track performance
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          No restaurant is linked to your account yet. Ask an admin to set{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            owner_id
          </code>{" "}
          on your row in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            restaurants
          </code>
          .
        </p>
      </div>
    );
  }

  const { data: coupons, error: couponsError } = await supabase
    .from("coupons")
    .select("id, title, expiration_at, is_active")
    .eq("restaurant_id", restaurant.id)
    .order("expiration_at", { ascending: true, nullsFirst: false });

  return (
    <div className={shellClass}>
      <section className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex flex-col gap-6 px-6 py-7 sm:flex-row sm:items-start sm:justify-between sm:px-10">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-primary/90">
              <BrandWordmark className="text-base" /> Merchant Dashboard
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-primary-dark sm:text-4xl">
              Manage your coupons
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground">
              Create, pause, and monitor offers for{" "}
              <span className="font-medium text-primary-dark">
                {restaurant.name}
              </span>
              .
            </p>
            <div className="pt-1">
              <RestaurantLogoUpload />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <RestaurantLogo
              logoUrl={restaurant.logo_url ?? null}
              name={restaurant.name}
              className="size-14 rounded-2xl"
            />
            <Link
              href="/restaurant/coupons/new"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
            >
              New coupon
            </Link>
          </div>
        </div>

        <div className="border-t border-border/60 px-6 py-6 sm:px-10">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-primary-dark">
              Your coupons
            </h2>
            <p className="text-sm text-muted-foreground">
              Toggle active status to control what customers can redeem.
            </p>
          </div>

          {couponsError ? (
            <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Could not load coupons.
            </p>
          ) : !coupons?.length ? (
            <div className="mt-6 rounded-2xl border border-border/60 bg-background px-5 py-6">
              <p className="text-sm text-muted-foreground">
                No coupons yet. Create one to get started.
              </p>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/60 bg-background">
              {coupons.map((coupon) => {
                const listingActive = coupon.is_active ?? true;
                return (
                  <li
                    key={coupon.id}
                    className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-card sm:flex-row sm:items-start sm:justify-between sm:gap-8"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 gap-y-1">
                        <p className="font-medium text-primary-dark">
                          {coupon.title}
                        </p>
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                            listingActive
                              ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {listingActive ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Expires{" "}
                        {coupon.expiration_at
                          ? new Date(coupon.expiration_at).toLocaleDateString(
                              undefined,
                              { dateStyle: "medium" },
                            )
                          : "—"}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <CouponActiveToggle
                        couponId={coupon.id}
                        restaurantId={restaurant.id}
                        isActive={coupon.is_active}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
