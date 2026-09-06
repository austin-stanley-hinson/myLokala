import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createTypedClient } from "@/lib/supabase/server";
import { BuyBalancePanel } from "./buy-balance-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Buy Lokala balance" },
  description:
    "Buy Lokala gift balance for yourself or send it as a gift, to spend at participating local businesses.",
  robots: { index: false, follow: false },
};

export default async function BuyBalancePage() {
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

      <BuyBalancePanel initialIsAuthenticated={isAuthenticated} />
    </div>
  );
}
