"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type CouponActiveToggleProps = {
  couponId: string;
  restaurantId: string;
  isActive: boolean | null;
};

export function CouponActiveToggle({
  couponId,
  restaurantId,
  isActive,
}: CouponActiveToggleProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentlyActive = isActive ?? true;
  const label = currentlyActive ? "Pause" : "Reactivate";

  async function handleToggle() {
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "restaurant_owner") {
        setError("Only business owners can change coupon status.");
        return;
      }

      const { error: updateError } = await supabase
        .from("coupons")
        .update({ is_active: !currentlyActive })
        .eq("id", couponId)
        .eq("restaurant_id", restaurantId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {error ? (
        <p
          className="max-w-[14rem] text-right text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Saving…" : label}
      </button>
    </div>
  );
}
