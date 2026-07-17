import { Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Non-interactive informational note for customer-facing deal surfaces.
 *
 * Web-based redemption has moved to the Lokala mobile app, so deal cards and
 * deal-detail views no longer expose a redeem action. This is intentionally a
 * static badge (a <span>, not a button/link) with no handlers — it only tells
 * customers where redemption happens.
 */
export function RedeemInAppNote({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-lokala-border bg-lokala-cream px-3 py-1.5 text-xs font-bold text-lokala-muted",
        className,
      )}
    >
      <Smartphone
        className="size-3.5 shrink-0 text-lokala-green-dark"
        aria-hidden
      />
      Redeem in the Lokala mobile app
    </span>
  );
}
