import Image from "next/image";
import Link from "next/link";

/**
 * Gift certificate promo card for the dashboard. Uses the Lokala logo as the
 * thumbnail (placeholder — there is no gift-certificate product image/asset
 * yet) and links to the existing /gift-certificates route. No backend gift
 * certificate logic is involved. The sun/yellow accent is reserved for this
 * gift certificate surface per the brand rules.
 */
export function GiftCertificateCard() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-lokala-green-dark/20 bg-gradient-to-br from-lokala-green to-lokala-green-dark p-6 shadow-lokala-card sm:p-8">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-lokala-soft">
            <Image
              src="/lokala-logo.png"
              alt="Lokala"
              width={64}
              height={64}
              className="h-10 w-auto object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/80">
              Lokala Gift Certificates
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">
              Send local love, anytime.
            </h2>
            <p className="mt-1 max-w-md text-sm font-medium text-white/90">
              Gift spending power at participating Waterville businesses.
            </p>
          </div>
        </div>

        <Link
          href="/gift-certificates"
          className="shrink-0 rounded-full bg-lokala-sun px-6 py-3.5 font-extrabold text-lokala-brown-dark shadow-lokala-card transition hover:-translate-y-0.5"
        >
          Buy a Gift Certificate
        </Link>
      </div>
    </section>
  );
}
