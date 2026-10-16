import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS } from "@/content/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service | Lokala",
  description: "The terms that govern your use of the Lokala app and mylokala.com.",
  path: "/terms",
});

export default function TermsPage() {
  return <LegalDocument doc={TERMS} />;
}
