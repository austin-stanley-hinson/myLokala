import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";

import { AlertBanner } from "@/components/layout/alert-banner";
import { HideOnHome } from "@/components/layout/hide-on-home";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

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
  title: "Lokala",
  description:
    "Support nearby businesses, discover local deals, and send gift certificates around Waterville, Maine.",
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
