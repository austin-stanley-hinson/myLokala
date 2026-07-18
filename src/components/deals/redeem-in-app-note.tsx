import { Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Non-interactive helper pill for customer-facing deal surfaces.
 *
 * Web redemption is not offered — customers redeem in the Lokala app. This is
 * a static <span> (not a button/link) with no handlers.
 */
export function RedeemInAppNote({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-lokala-border/80 bg-lokala-cream px-2.5 py-1 text-[11px] font-bold text-lokala-muted",
        className,
      )}
    >
      <Smartphone
        className="size-3 shrink-0 text-lokala-green-dark"
        aria-hidden
      />
      Redeem in Lokala app
    </span>
  );
}
