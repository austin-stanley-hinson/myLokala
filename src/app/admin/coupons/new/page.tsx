"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

type RestaurantOption = {
  id: string;
  name: string;
};

export default function NewAdminCouponPage() {
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [restaurantsError, setRestaurantsError] = useState<string | null>(null);

  const [restaurantId, setRestaurantId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expirationAt, setExpirationAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [maxRedemptions, setMaxRedemptions] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRestaurants() {
      setRestaurantsLoading(true);
      setRestaurantsError(null);

      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("restaurants")
          .select("id, name")
          .order("name", { ascending: true });

        if (fetchError) {
          if (!cancelled) setRestaurantsError(fetchError.message);
          return;
        }

        if (cancelled) return;

        const nextRestaurants = (data ?? []) as RestaurantOption[];
        setRestaurants(nextRestaurants);
        setRestaurantId((current) => current || nextRestaurants[0]?.id || "");
      } catch (err) {
        if (!cancelled) {
          setRestaurantsError(
            err instanceof Error
              ? err.message
              : "Could not load restaurants. Try again.",
          );
        }
      } finally {
        if (!cancelled) setRestaurantsLoading(false);
      }
    }

    void loadRestaurants();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const parsedMaxRedemptions = maxRedemptions.trim()
        ? Number(maxRedemptions)
        : null;

      if (
        parsedMaxRedemptions !== null &&
        (!Number.isFinite(parsedMaxRedemptions) || parsedMaxRedemptions < 1)
      ) {
        setError("Max redemptions must be a number greater than 0.");
        return;
      }

      const { error: insertError } = await supabase.from("coupons").insert({
        restaurant_id: restaurantId,
        title: title.trim(),
        description: description.trim() || null,
        expiration_at: expirationAt,
        is_active: isActive,
        max_redemptions: parsedMaxRedemptions,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setTitle("");
      setDescription("");
      setExpirationAt("");
      setIsActive(true);
      setMaxRedemptions("");
      setSuccess("Coupon added successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Add Coupon</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Internal tool for seeding business offers
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to Home
          </Link>
        </div>

        {restaurantsLoading ? (
          <p className="mt-6 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Loading businesses...
          </p>
        ) : restaurantsError ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {restaurantsError}
          </p>
        ) : restaurants.length === 0 ? (
          <p className="mt-6 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            No businesses found. Add a business first.
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4"
          aria-busy={loading}
        >
          {loading ? (
            <p
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              Saving coupon...
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="restaurantId" className="text-sm font-medium">
              Business
            </label>
            <select
              id="restaurantId"
              name="restaurantId"
              required
              disabled={loading || restaurantsLoading || restaurants.length === 0}
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="" disabled>
                Select a business
              </option>
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              disabled={loading}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              disabled={loading}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="expirationAt" className="text-sm font-medium">
                Expiration date
              </label>
              <input
                id="expirationAt"
                name="expirationAt"
                type="date"
                required
                disabled={loading}
                value={expirationAt}
                onChange={(e) => setExpirationAt(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="maxRedemptions" className="text-sm font-medium">
                Max redemptions (optional)
              </label>
              <input
                id="maxRedemptions"
                name="maxRedemptions"
                type="number"
                min={1}
                step={1}
                disabled={loading}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isActive}
              disabled={loading}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            Active coupon
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
            >
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || restaurantsLoading || restaurants.length === 0}
            className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving..." : "Add coupon"}
          </button>
        </form>
      </div>
    </div>
  );
}
