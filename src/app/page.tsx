import Image from "next/image";
import Link from "next/link";

import { BrandWordmark } from "@/components/brand-wordmark";
import RedeemButton from "@/components/coupons/redeem-button";
import RestaurantLogo from "@/components/restaurants/restaurant-logo";
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

const actionCards = [
  {
    href: "/browse",
    title: "Find Deals",
    body: "Browse offers from nearby cafés, restaurants, and local shops.",
    surface: "bg-lokala-green-soft",
    iconBg: "text-lokala-green-dark",
    icon: "%",
  },
  {
    href: "/gift-certificates",
    title: "Buy a Gift Certificate",
    body: "Send local spending power to a friend, student, or family member.",
    surface: "bg-lokala-sun-soft",
    iconBg: "text-lokala-brown",
    icon: "🎁",
  },
  {
    href: "/browse",
    title: "Explore Businesses",
    body: "Meet the local businesses that make the community feel alive.",
    surface: "bg-lokala-sky",
    iconBg: "text-lokala-sky-dark",
    icon: "🏪",
  },
] as const;

function HeroImageCard() {
  return (
    <div className="relative">
      <div className="absolute -left-5 -top-5 h-28 w-28 rounded-full bg-lokala-sun-soft blur-2xl" />
      <div className="absolute -bottom-6 -right-4 h-32 w-32 rounded-full bg-lokala-green-light blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white bg-white p-3 shadow-lokala-card">
        <div className="relative flex h-[340px] w-full flex-col items-center justify-center gap-5 overflow-hidden rounded-[2rem] bg-gradient-to-br from-lokala-green-soft via-lokala-cream to-lokala-sun-soft sm:h-[420px]">
          <Image
            src="/lokala-logo.png"
            alt="Lokala"
            width={120}
            height={120}
            className="h-24 w-24 rounded-3xl bg-white object-contain p-2 shadow-lokala-soft"
          />
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-lokala-green-dark">
              Waterville · Maine
            </p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-lokala-brown-dark">
              Rooted in your community
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 px-6">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-lokala-brown">
              Pine-town charm
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-lokala-green-dark">
              Shop small
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-lokala-sky-dark">
              Local first
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <h1 className="text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          <BrandWordmark className="text-inherit" /> Deals
        </h1>
        <p className="rounded-2xl border border-lokala-danger/30 bg-lokala-danger/5 px-4 py-3 text-sm text-lokala-danger">
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
          <h1 className="text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
            <BrandWordmark className="text-inherit" /> Deals
          </h1>
          <p className="rounded-2xl border border-lokala-danger/30 bg-lokala-danger/5 px-4 py-3 text-sm text-lokala-danger">
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
    <div className="w-full">
      {/* Hero */}
      <section className="bg-gradient-to-b from-lokala-green-soft via-lokala-cream to-lokala-cream-light px-4 py-14 sm:px-6 md:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-lokala-green-dark shadow-lokala-soft">
              <span className="h-2 w-2 rounded-full bg-lokala-green" />
              Support local. Save nearby.
            </div>

            <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-lokala-brown-dark sm:text-5xl md:text-6xl">
              Local deals, rooted in your community.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-lokala-muted">
              Discover offers, gift certificates, and local favorites from
              businesses around Waterville. <BrandWordmark className="text-base" />{" "}
              keeps your spending close to home.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/browse"
                className="rounded-full bg-lokala-green px-7 py-4 text-center font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark"
              >
                Browse Local Deals
              </Link>
              <Link
                href="/gift-certificates"
                className="rounded-full border border-lokala-border bg-white px-7 py-4 text-center font-bold text-lokala-brown transition hover:-translate-y-0.5 hover:bg-lokala-brown-soft"
              >
                Buy a Gift Certificate
              </Link>
              {user && profileRole === "restaurant_owner" ? (
                <Link
                  href="/restaurant/dashboard"
                  className="rounded-full border border-lokala-border bg-white px-7 py-4 text-center font-bold text-lokala-green-dark transition hover:-translate-y-0.5 hover:bg-lokala-green-light"
                >
                  Business Dashboard
                </Link>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-lokala-muted">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-lokala-green" />
                Authenticated redemptions
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-lokala-green" />
                Real local businesses
              </span>
            </div>
          </div>

          <HeroImageCard />
        </div>
      </section>

      {/* Community action cards */}
      <section className="bg-white px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
                Start here
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-lokala-brown-dark">
                What would you like to do today?
              </h2>
            </div>
            <p className="max-w-xl text-lokala-muted">
              Shop local, discover nearby deals, or send someone a community
              gift.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {actionCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className={`group rounded-3xl border border-lokala-border ${card.surface} p-6 shadow-lokala-card transition hover:-translate-y-1 hover:shadow-lokala-lift`}
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl ${card.iconBg}`}
                >
                  {card.icon}
                </div>
                <h3 className="text-xl font-extrabold text-lokala-brown-dark">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-lokala-muted">
                  {card.body}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured local deals */}
      <section className="bg-lokala-cream-light px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
                Featured local deals
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-lokala-brown-dark">
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
              {rows.map((coupon) => {
                const business = restaurantMap.get(coupon.restaurant_id);
                return (
                  <li
                    key={coupon.id}
                    className="group flex flex-col rounded-[2rem] border border-lokala-border bg-white p-5 shadow-lokala-card transition duration-200 hover:-translate-y-1 hover:shadow-lokala-lift"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-[1.5rem] bg-lokala-green-soft px-4 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <RestaurantLogo
                          logoUrl={business?.logo_url ?? null}
                          name={business?.name ?? "Business"}
                        />
                        <p className="truncate text-sm font-bold text-lokala-brown-dark">
                          {business?.name ?? "Local business"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-lokala-green-light px-3 py-1 text-xs font-extrabold text-lokala-green-dark">
                        Active
                      </span>
                    </div>

                    <p className="text-sm font-bold text-lokala-green-dark">
                      Local deal
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-xl font-extrabold text-lokala-brown-dark">
                      {coupon.title}
                    </h3>

                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-lokala-muted">
                      {coupon.description ??
                        "A great local deal — redeem while it lasts."}
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-4 text-xs font-semibold text-lokala-muted">
                      <span>{coupon.current_redemptions ?? 0} redemptions</span>
                      <span>
                        Expires{" "}
                        {coupon.expiration_at
                          ? new Date(coupon.expiration_at).toLocaleDateString(
                              undefined,
                              { dateStyle: "medium" },
                            )
                          : "—"}
                      </span>
                    </div>

                    <div className="mt-5 pt-1">
                      <RedeemButton
                        couponId={coupon.id}
                        restaurantId={coupon.restaurant_id}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Gift certificates CTA */}
      <section className="bg-white px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-8 overflow-hidden rounded-[2.5rem] border border-lokala-border bg-gradient-to-br from-lokala-sun-soft via-lokala-cream to-white p-8 shadow-lokala-card md:grid-cols-[1.1fr_0.9fr] md:p-12">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
                Gift Certificates
              </p>
              <h2 className="mt-3 text-3xl font-extrabold text-lokala-brown-dark sm:text-4xl">
                Send someone a little local love.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-lokala-muted">
                Choose an amount and send a gift certificate they can use with
                participating local businesses around Waterville.
              </p>
              <Link
                href="/gift-certificates"
                className="mt-6 inline-block rounded-full bg-lokala-sun px-7 py-4 font-extrabold text-lokala-brown-dark shadow-lokala-card transition hover:-translate-y-0.5"
              >
                Buy a Gift Certificate
              </Link>
            </div>
            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-lokala-soft">
              <p className="text-sm font-bold text-lokala-brown-dark">
                Gift amount
              </p>
              <div className="mt-2 rounded-2xl border border-lokala-border bg-lokala-cream-light px-4 py-4 text-3xl font-extrabold text-lokala-brown-dark">
                $100
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["$25", "$50", "$100", "$250"].map((amount) => (
                  <span
                    key={amount}
                    className="rounded-full bg-lokala-green-light px-3 py-1 text-sm font-bold text-lokala-green-dark"
                  >
                    {amount}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community impact */}
      <section className="bg-lokala-green-soft px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[2.5rem] bg-white p-8 shadow-lokala-card md:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
              Community impact
            </p>
            <h2 className="mt-3 text-3xl font-extrabold text-lokala-brown-dark sm:text-4xl">
              Every purchase helps local businesses grow.
            </h2>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <div className="rounded-3xl bg-lokala-cream p-6">
                <p className="text-4xl font-extrabold text-lokala-green-dark">
                  10+
                </p>
                <p className="mt-2 font-bold text-lokala-brown-dark">
                  Local businesses
                </p>
              </div>
              <div className="rounded-3xl bg-lokala-cream p-6">
                <p className="text-4xl font-extrabold text-lokala-green-dark">
                  200+
                </p>
                <p className="mt-2 font-bold text-lokala-brown-dark">
                  Community users
                </p>
              </div>
              <div className="rounded-3xl bg-lokala-cream p-6">
                <p className="text-4xl font-extrabold text-lokala-green-dark">
                  Waterville
                </p>
                <p className="mt-2 font-bold text-lokala-brown-dark">
                  Built for local discovery
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
