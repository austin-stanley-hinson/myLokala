"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides public marketing chrome on business portal routes (/business/*)
 * so the admin area does not show the large public footer/header clutter.
 */
export function HideOnBusiness({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/business" || pathname.startsWith("/business/")) {
    return null;
  }
  return <>{children}</>;
}
