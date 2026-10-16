import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY } from "@/content/legal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy | Lokala",
  description:
    "How Lokala LLC collects, uses, and protects your information across the Lokala app and mylokala.com.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY} />;
}
