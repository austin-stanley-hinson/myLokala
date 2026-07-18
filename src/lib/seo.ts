import type { Metadata } from "next";

/** Production site origin used for metadataBase, canonicals, sitemap, and OG URLs. */
export const SITE_URL = "https://www.mylokala.com";

export const SITE_NAME = "Lokala";

const DEFAULT_OG_IMAGE = `${SITE_URL}/logo-try-1.png`;

type PageSeoInput = {
  title: string;
  description: string;
  /** Path beginning with `/` (e.g. `/browse`). */
  path: string;
};

/**
 * Build page-level Metadata with canonical + Open Graph + Twitter cards.
 * Honest copy only — callers supply titles/descriptions.
 */
export function buildPageMetadata({
  title,
  description,
  path,
}: PageSeoInput): Metadata {
  const url = new URL(path, SITE_URL).toString();

  return {
    // Absolute so the root `%s | Lokala` template does not double-suffix
    // titles that already include the brand.
    title: {
      absolute: title,
    },
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          alt: "Lokala",
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}
