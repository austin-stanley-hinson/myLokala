import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { APP_STORE_URL, COMPANY, CONTACT_EMAIL } from "@/lib/site";

/**
 * Honest Organization + MobileApplication JSON-LD for the public site.
 * No ratings, reviews, or invented offers.
 */
export function SiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        legalName: COMPANY.legalName,
        url: SITE_URL,
        logo: `${SITE_URL}/lokala-mark.png`,
        email: CONTACT_EMAIL,
        description: SITE_DESCRIPTION,
        address: {
          "@type": "PostalAddress",
          streetAddress: COMPANY.street,
          addressLocality: COMPANY.locality,
          addressRegion: COMPANY.region,
          addressCountry: "US",
        },
        sameAs: [APP_STORE_URL],
      },
      {
        "@type": "MobileApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        operatingSystem: "iOS",
        applicationCategory: "LifestyleApplication",
        downloadUrl: APP_STORE_URL,
        installUrl: APP_STORE_URL,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
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
