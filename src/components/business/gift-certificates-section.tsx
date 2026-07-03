import { Gift } from "lucide-react";

/**
 * Placeholder for the merchant gift-certificate publishing tools.
 *
 * The dashboard's B2B direction is publishing gift certificates (backed by
 * Stripe Connect for payouts), not merchant-owned deals. The publishing UI
 * lands in a later checkpoint; for now this communicates what's coming and that
 * it depends on a connected Stripe account.
 */
export function GiftCertificatesSection() {
  return (
    <section id="gift-certificates" className="scroll-mt-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-lokala-brown-dark">
            Gift certificates
          </h2>
          <p className="mt-1 text-sm text-lokala-muted">
            Sell gift certificates for your business to local customers.
          </p>
        </div>
        <span className="self-start rounded-full bg-lokala-brown-soft px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-lokala-brown sm:self-auto">
          Coming soon
        </span>
      </div>

      <div className="mt-5 rounded-3xl border border-dashed border-lokala-border bg-white p-8 text-center shadow-lokala-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
          <Gift className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-lg font-bold text-lokala-brown-dark">
          Gift certificate publishing is coming next
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-lokala-muted">
          Soon you&apos;ll be able to publish gift certificates that customers
          can buy in the Lokala app. You&apos;ll need to connect Stripe first so
          you can accept payments and receive payouts.
        </p>
      </div>
    </section>
  );
}
