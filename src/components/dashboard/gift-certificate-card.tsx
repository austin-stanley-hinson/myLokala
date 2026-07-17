import Image from "next/image";
import Link from "next/link";

/**
 * Gift certificate promo card, sized for the dashboard right rail (compact,
 * vertical). Uses the Lokala logo as the thumbnail (placeholder — there is no
 * gift-certificate product image asset yet) and links to the existing
 * /gift-certificates route. No backend gift certificate logic is involved. The
 * sun/yellow accent is reserved for this gift certificate surface.
 */
export function GiftCertificateCard() {
  return (
    <section className="overflow-hidden rounded-3xl border border-lokala-green-dark/20 bg-gradient-to-br from-lokala-green to-lokala-green-dark p-5 shadow-lokala-card">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-lokala-soft">
          <Image
            src="/lokala-logo.png"
            alt="Lokala"
            width={48}
            height={48}
            className="h-8 w-auto object-contain"
          />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
          Lokala Gift Certificates
        </p>
      </div>

      <h3 className="mt-4 text-xl font-extrabold text-white">
        Send local love, anytime.
      </h3>
      <p className="mt-1 text-sm font-medium text-white/90">
        Gift spending power at participating Waterville businesses.
      </p>

      <Link
        href="/gift-certificates"
        className="mt-4 block rounded-full bg-lokala-sun px-5 py-3 text-center font-extrabold text-lokala-brown-dark shadow-lokala-card transition hover:-translate-y-0.5"
      >
        Buy a Gift Certificate
      </Link>
    </section>
  );
}
