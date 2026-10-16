import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";

import { PageBackground } from "@/components/layout/page-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteJsonLd } from "@/components/seo/json-ld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

import { APP_STORE_ID } from "@/lib/site";

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
    SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  itunes: {
    appId: APP_STORE_ID,
  },
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
      SITE_DESCRIPTION,
    images: [
      {
        url: "/lokala-mark.png",
        alt: "Lokala",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Lokala | Always Local",
    description:
      SITE_DESCRIPTION,
    images: ["/lokala-mark.png"],
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
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
