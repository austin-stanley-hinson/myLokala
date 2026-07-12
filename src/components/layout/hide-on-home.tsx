"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides the global site chrome (alert banner, header, footer) on the homepage
 * only, where the app-like dashboard provides its own sidebar + header. Every
 * other route renders the chrome unchanged. Server-component children are
 * passed through and only conditionally rendered, so no component needs to
 * become a client component.
 */
export function HideOnHome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <>{children}</>;
}
