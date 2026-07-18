import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";

import { AlertBanner } from "@/components/layout/alert-banner";
import { HideOnHome } from "@/components/layout/hide-on-home";
import { PageBackground } from "@/components/layout/page-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteJsonLd } from "@/components/seo/json-ld";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

import "./globals.css";

// Warm, soft serif for headings — civic/local-paper character.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

// Clean, highly legible sans for UI/body.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lokala | Always Local",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Discover local deals and gift certificates from participating businesses in Waterville, Maine. Lokala helps neighbors support nearby businesses and keep spending local.",
  applicationName: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Lokala | Always Local",
    description:
      "Discover local deals and gift certificates from participating businesses in Waterville, Maine. Lokala helps neighbors support nearby businesses and keep spending local.",
    images: [
      {
        url: "/logo-try-1.png",
        alt: "Lokala",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Lokala | Always Local",
    description:
      "Discover local deals and gift certificates from participating businesses in Waterville, Maine.",
    images: ["/logo-try-1.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${geistMono.variable} h-full font-sans antialiased`}
    >
      <body className="flex min-h-full flex-col bg-lokala-cream-light text-lokala-text">
        <SiteJsonLd />
        <PageBackground />
        <HideOnHome>
          <AlertBanner />
        </HideOnHome>
        <HideOnHome>
          <SiteHeader />
        </HideOnHome>
        <main className="flex flex-1 flex-col">{children}</main>
        <HideOnHome>
          <SiteFooter />
        </HideOnHome>
      </body>
    </html>
  );
}
