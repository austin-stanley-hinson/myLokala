import { SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * Honest Organization + WebSite JSON-LD for the public site.
 * No physical storefront, ratings, reviews, or invented offers.
 */
export function SiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/logo-try-1.png`,
        description:
          "Lokala helps neighbors discover local deals and gift certificates from participating businesses in Waterville, Maine.",
        areaServed: {
          "@type": "City",
          name: "Waterville",
          containedInPlace: {
            "@type": "State",
            name: "Maine",
          },
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description:
          "Discover local deals and gift certificates from participating businesses in Waterville, Maine.",
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
        inLanguage: "en-US",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
