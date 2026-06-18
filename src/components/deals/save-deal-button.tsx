"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SaveDealButtonProps = {
  dealId: string;
  initialSaved?: boolean;
};

export default function SaveDealButton({
  dealId,
  initialSaved = false,
}: SaveDealButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const toggleSaved = async () => {
    const supabase = createClient();
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      if (saved) {
        const { error } = await supabase
          .from("saved_deals")
          .delete()
          .eq("user_id", user.id)
          .eq("deal_id", dealId);
        if (!error) setSaved(false);
      } else {
        const { error } = await supabase
          .from("saved_deals")
          .insert({ user_id: user.id, deal_id: dealId });
        // Ignore unique-violation races — treat as saved.
        if (!error || error.code === "23505") setSaved(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleSaved}
      disabled={loading}
      aria-pressed={saved}
      aria-label={saved ? "Remove saved offer" : "Save offer"}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-60",
        saved
          ? "border-lokala-green bg-lokala-green-light text-lokala-green-dark"
          : "border-lokala-border bg-white text-lokala-muted hover:bg-lokala-green-soft hover:text-lokala-green-dark",
      )}
    >
      <Bookmark
        className="size-4"
        aria-hidden
        fill={saved ? "currentColor" : "none"}
      />
    </button>
  );
}
