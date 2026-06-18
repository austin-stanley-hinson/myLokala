"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type RedeemDealInput = {
  id: string;
  business_name: string | null;
  title: string | null;
  discount_detail: string | null;
  category: string | null;
};

type RedeemDealButtonProps = {
  deal: RedeemDealInput;
  /** Whether the current user has already redeemed this deal (best-effort hint). */
  initialRedeemed?: boolean;
};

export default function RedeemDealButton({
  deal,
  initialRedeemed = false,
}: RedeemDealButtonProps) {
  const [loading, setLoading] = useState(false);
  const [redeemed, setRedeemed] = useState(initialRedeemed);
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

      // Prevent duplicate redemptions for the same deal.
      const { data: existingRows, error: existingError } = await supabase
        .from("redemptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("deal_id", deal.id)
        .limit(1);

      if (existingError) {
        setError(existingError.message);
        return;
      }

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        setRedeemed(true);
        setError("You already redeemed this offer.");
        return;
      }

      const { error: redemptionError } = await supabase
        .from("redemptions")
        .insert({
          deal_id: deal.id,
          user_id: user.id,
          business_name: deal.business_name,
          deal_title: deal.title,
          discount_detail: deal.discount_detail,
          category: deal.category,
          redeemed_at: new Date().toISOString(),
        });

      if (redemptionError) {
        throw redemptionError;
      }

      setRedeemed(true);
      setSuccess("Offer redeemed successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRedeem}
        disabled={loading || redeemed}
        className="w-full rounded-full bg-lokala-green px-4 py-3 text-sm font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {redeemed ? "Redeemed" : loading ? "Redeeming…" : "Redeem offer"}
      </button>

      {success ? (
        <p className="mt-2 text-sm font-semibold text-lokala-green-dark">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm font-semibold text-lokala-danger">{error}</p>
      ) : null}
    </div>
  );
}
