"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function NewCouponPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expirationAt, setExpirationAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be signed in to create a coupon.");
        return;
      }

      const { data: restaurant, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (restaurantError) {
        setError(restaurantError.message);
        return;
      }

      if (!restaurant) {
        setError("No restaurant is linked to your account.");
        return;
      }

      const { error: insertError } = await supabase.from("coupons").insert({
        title: title.trim(),
        description: description.trim() || null,
        expiration_at: expirationAt,
        restaurant_id: restaurant.id,
        is_active: true,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      router.replace("/restaurant/dashboard");
      router.refresh();
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
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">New coupon</h1>
        <Link
          href="/restaurant/dashboard"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Cancel
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Create an offer for your restaurant.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col gap-4"
        aria-busy={loading}
      >
        {loading ? (
          <p
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            Creating coupon…
          </p>
        ) : null}

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
            Description
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

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving…" : "Create coupon"}
        </button>
      </form>
    </div>
  );
}
