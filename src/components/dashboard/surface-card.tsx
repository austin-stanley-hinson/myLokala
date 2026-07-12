import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Warm rounded surface used across the dashboard for cards/panels. Keeps the
 * elevated, app-like look consistent (border + soft shadow + white surface).
 */
export function SurfaceCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card",
        className,
      )}
      {...props}
    />
  );
}
