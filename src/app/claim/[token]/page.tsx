import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
import { hashClaimToken } from "@/lib/payments/claim-token";
import { createTypedClient } from "@/lib/supabase/server";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { ClaimPanel } from "./claim-panel";

export const dynamic = "force-dynamic";

type ClaimPageProps = {
  params: Promise<{ token: string }>;
};

export type GiftClaimPreview =
  | { found: false }
  | { found: true; status: string; faceValueCents: number; currency: string };

async function loadPreview(rawToken: string): Promise<GiftClaimPreview> {
  if (!hasPublicSupabaseEnv()) {
    return { found: false };
  }

  const claimTokenHash = hashClaimToken(rawToken);
  const supabase = await createTypedClient();

  const { data, error } = await supabase.rpc("preview_gift_claim", {
    p_claim_token_hash: claimTokenHash,
  });

  if (error || !data) {
    return { found: false };
  }

  const record = data as {
    found?: boolean;
    status?: string;
    face_value_cents?: number;
    currency?: string;
  };

  if (!record.found) {
    return { found: false };
  }

  return {
    found: true,
    status: record.status ?? "pending",
    faceValueCents: record.face_value_cents ?? 0,
    currency: record.currency ?? "USD",
  };
}

export async function generateMetadata({ params }: ClaimPageProps): Promise<Metadata> {
  void params;
  return {
    title: { absolute: "Claim your Lokala gift" },
    robots: { index: false, follow: false },
  };
}

export default async function ClaimGiftPage({ params }: ClaimPageProps) {
  const { token } = await params;
  const rawToken = decodeURIComponent(token);

  const preview = await loadPreview(rawToken);

  let isAuthenticated = false;
  if (hasPublicSupabaseEnv()) {
    const supabase = await createTypedClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header>
        <Link href="/" className="inline-flex items-center gap-2 self-start">
          <span className="relative size-9 overflow-hidden rounded-xl bg-lokala-cream">
            <Image
              src="/logo-try-1.png"
              alt=""
              width={36}
              height={36}
              className="size-9 object-cover"
            />
          </span>
          <BrandWordmark className="text-xl" />
        </Link>
      </header>

      <ClaimPanel
        rawToken={rawToken}
        preview={preview}
        initialIsAuthenticated={isAuthenticated}
      />
    </div>
  );
}
