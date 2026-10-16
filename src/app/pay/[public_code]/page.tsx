import type { Metadata } from "next";
import { ScanLine } from "lucide-react";

import { AppStoreButton } from "@/components/app/app-store-button";

/**
 * Printed merchant QR codes still point at /pay/<code>. Scanning one with the
 * phone camera lands here; redemption happens in the app's Scan tab.
 */
export const metadata: Metadata = {
  title: { absolute: "Open in the Lokala app | Lokala" },
  robots: { index: false, follow: false },
};

export default function PayByQrPage() {
  return (
    <section className="flex flex-1 items-center px-4 py-16 sm:px-6">
      <div className="rise-in mx-auto w-full max-w-md rounded-lokala-lg border border-lokala-border bg-white p-8 text-center shadow-lokala-lift">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
          <ScanLine className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-bold">You found a Lokala spot.</h1>
        <p className="mt-3 text-lokala-muted">
          This business takes Lokala. Open the app, tap <strong>Scan</strong>,
          and point it at this same code to use your deal at the counter.
        </p>
        <p className="mt-6 text-sm font-semibold text-lokala-muted">
          Don&apos;t have it yet?
        </p>
        <AppStoreButton className="mt-3" />
      </div>
    </section>
  );
}
