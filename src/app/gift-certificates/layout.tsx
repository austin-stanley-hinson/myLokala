import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Lokala Gift Certificates | Support Local Businesses",
  description:
    "Send gift certificates that help friends, students, and neighbors support participating local businesses in Waterville.",
  path: "/gift-certificates",
});

export default function GiftCertificatesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
