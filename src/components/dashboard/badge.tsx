import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const badgeStyles = {
  // Active / ongoing status
  active: "bg-lokala-green-light text-lokala-green-dark",
  // Neutral / inactive
  neutral: "bg-lokala-brown-soft text-lokala-brown",
  // Category label
  category: "bg-lokala-sky text-lokala-sky-dark",
  // Gift-certificate / sun accent (reserved for gift certificate surfaces)
  gift: "bg-lokala-sun-soft text-lokala-brown-dark",
} as const;

export type BadgeVariant = keyof typeof badgeStyles;

export function Badge({
  variant = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold",
        badgeStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
