import { MapPin, Smartphone } from "lucide-react";

import { formatOfferBadge, type CatalogDealCardData } from "@/lib/catalog/browse-deals";

/**
 * One MMCC catalog deal. Browse-only: no redeem action here -- redemption
 * only exists in the mobile app (product design), so the card's only call
 * to action is text pointing there, never a button that does anything on
 * web. Business name, title, subtitle, and discount detail are rendered
 * verbatim from the imported source -- no rewriting.
 */
export function DealCard({ deal }: { deal: CatalogDealCardData }) {
  const offerBadge = formatOfferBadge(deal);

  return (
    <li className="flex flex-col gap-3 rounded-3xl border border-lokala-border bg-white p-5 shadow-lokala-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-lokala-green-dark">{deal.businessName}</p>
          <h2 className="mt-0.5 text-base font-extrabold text-lokala-brown-dark">{deal.title}</h2>
          {deal.subtitle ? <p className="mt-1 text-sm text-lokala-muted">{deal.subtitle}</p> : null}
        </div>
        {offerBadge ? (
          <span className="shrink-0 rounded-full bg-lokala-green-light px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-lokala-green-dark">
            {offerBadge}
          </span>
        ) : null}
      </div>

      <p className="text-sm leading-6 text-lokala-brown">{deal.discountDetail}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-lokala-muted">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {deal.address}
        </span>
        {deal.expiresAt ? <span>{deal.expiresAt}</span> : null}
      </div>

      <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-lokala-green-dark">
        <Smartphone className="size-4 shrink-0" aria-hidden />
        Redeem this deal in the Lokala mobile app
      </p>
    </li>
  );
}
