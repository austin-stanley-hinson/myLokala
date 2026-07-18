import Image from "next/image";
import Link from "next/link";

/**
 * Gift certificate promo card for the dashboard right rail.
 * Links to the existing /gift-certificates route. Uses /logo-try-1.png in a
 * single clean container (no nested white-on-white shapes).
 */
export function GiftCertificateCard() {
  return (
    <section className="overflow-hidden rounded-3xl border border-lokala-green-dark/20 bg-gradient-to-br from-lokala-green to-lokala-green-dark p-5 shadow-lokala-card">
      <div className="flex items-center gap-3">
        {/* One cream tile — mark fills it. Avoids a second white box around the
            asset (logo-try-1.png already has a baked near-white background). */}
        <span className="relative size-11 shrink-0 overflow-hidden rounded-2xl bg-lokala-cream shadow-lokala-soft">
          <Image
            src="/logo-try-1.png"
            alt="Lokala"
            width={44}
            height={44}
            className="size-11 object-cover"
          />
        </span>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
          Lokala Gift Certificates
        </p>
      </div>

      <h3 className="mt-4 text-xl font-extrabold text-white">
        Send local love, anytime.
      </h3>
      <p className="mt-1 text-sm font-medium text-white/90">
        Send a gift certificate they can use at local Waterville businesses.
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
