import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

/**
 * Public indexable URLs only.
 * /business is an authenticated dashboard (redirects to login) so it is
 * omitted from the sitemap even though it has safe generic metadata.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/browse`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/gift-certificates`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
