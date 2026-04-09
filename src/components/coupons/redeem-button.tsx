"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RedeemButtonProps = {
  couponId: string;
  restaurantId: string;
};

export default function RedeemButton({
  couponId,
  restaurantId,
}: RedeemButtonProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleRedeem = async () => {
    const supabase = createClient();

    setLoading(true);
    setSuccess("");
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: existingRows, error: existingError } = await supabase
        .from("redemptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("coupon_id", couponId)
        .limit(1);

      if (existingError) {
        setError(existingError.message);
        return;
      }

      const alreadyRedeemed = Array.isArray(existingRows) && existingRows.length > 0;
      if (alreadyRedeemed) {
        setError("You already redeemed this coupon");
        return;
      }

      const { data: couponRows, error: couponFetchError } = await supabase
        .from("coupons")
        .select("is_active, current_redemptions")
        .eq("id", couponId)
        .limit(1);

      if (couponFetchError) {
        setError(couponFetchError.message);
        return;
      }

      const couponRow = couponRows?.[0];
      if (!couponRow) {
        setError("This coupon is no longer available.");
        return;
      }

      const couponIsActive = couponRow.is_active ?? true;
      if (!couponIsActive) {
        setError("This coupon is currently unavailable");
        return;
      }

      // 1. insert redemption
      const { error: redemptionError } = await supabase
        .from("redemptions")
        .insert({
          coupon_id: couponId,
          user_id: user.id,
          restaurant_id: restaurantId,
          status: "redeemed",
        });

      if (redemptionError) {
        throw redemptionError;
      }

      // 2. increment current_redemptions
      const nextCount = (couponRow.current_redemptions ?? 0) + 1;

      const { error: couponUpdateError } = await supabase
        .from("coupons")
        .update({ current_redemptions: nextCount })
        .eq("id", couponId);

      if (couponUpdateError) {
        throw couponUpdateError;
      }

      setSuccess("Coupon redeemed successfully.");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={handleRedeem}
        disabled={loading}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Redeeming..." : "Redeem"}
      </button>

      {success ? <p className="mt-2 text-sm text-green-600">{success}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}