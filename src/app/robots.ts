import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

/**
 * Public discovery allowed; private/auth/admin/API surfaces disallowed.
 * Homepage, /browse, and /gift-certificates remain crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/api",
        "/api/",
        "/forgot-password",
        "/reset-password",
        "/my-redemptions",
        "/auth/",
        "/business/profile",
        "/business/payments",
        "/business/gift-certificates",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
