import Image from "next/image";
import Link from "next/link";
import { Clock, Globe, MapPin } from "lucide-react";

import { RedeemInAppNote } from "@/components/deals/redeem-in-app-note";
import SaveDealButton from "@/components/deals/save-deal-button";
import { Badge } from "@/components/dashboard/badge";
import { cn } from "@/lib/utils";
import { formatExpiry, type Deal } from "@/types/deal";

/**
 * Redesigned homepage deal card. Presentational — it composes the existing
 * SaveDealButton without changing its behavior.
 *
 * The web is discovery-only: redemption happens in the Lokala mobile app, so
 * the card shows a static "Redeem in the Lokala mobile app" note instead of a
 * web redeem action.
 *
 * There is no deal image column in the schema, so the Lokala logo is used as
 * the fallback thumbnail (do not assume a deals.image_url field).
 */
export function DealCard({
  deal,
  initialSaved,
}: {
  deal: Deal;
  initialSaved: boolean;
}) {
  const active = deal.is_active !== false;

  return (
    <li className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-lokala-border bg-white shadow-lokala-card transition duration-200 hover:-translate-y-1 hover:shadow-lokala-lift">
      <div className="relative h-32 bg-gradient-to-br from-lokala-green-soft via-lokala-cream to-lokala-sun-soft">
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src="/lokala-logo.png"
            alt=""
            width={140}
            height={56}
            className="h-12 w-auto rounded-xl bg-white/90 object-contain p-1.5 shadow-lokala-soft"
          />
        </div>
        {deal.category ? (
          <div className="absolute left-3 top-3">
            <Badge variant="category">{deal.category}</Badge>
          </div>
        ) : null}
        <div className="absolute right-3 top-3">
          <Badge variant={active ? "active" : "neutral"}>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                active ? "bg-lokala-green-dark" : "bg-lokala-brown",
              )}
              aria-hidden
            />
            {active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="truncate text-sm font-bold text-lokala-brown">
          {deal.business_name ?? "Local business"}
        </p>
        <h3 className="mt-1 line-clamp-2 text-xl font-extrabold leading-snug text-lokala-brown-dark">
          {deal.title ?? "Local offer"}
        </h3>
        {deal.subtitle ? (
          <p className="mt-1 line-clamp-1 text-sm font-semibold text-lokala-muted">
            {deal.subtitle}
          </p>
        ) : null}

        {deal.discount_detail ? (
          <p className="mt-3 w-fit rounded-xl bg-lokala-green-light px-3 py-1.5 text-base font-extrabold text-lokala-green-dark">
            {deal.discount_detail}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-1.5 text-xs font-semibold text-lokala-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            {formatExpiry(deal.expires_at)}
          </span>
          {deal.address ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-1">{deal.address}</span>
            </span>
          ) : null}
          {deal.website ? (
            <Link
              href={deal.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-lokala-green-dark underline-offset-4 hover:underline"
            >
              <Globe className="size-3.5 shrink-0" aria-hidden />
              Visit website
            </Link>
          ) : null}
        </div>

        {/* Redemption is app-only; keep Save available. Pinned to the bottom
            so cards of varying height stay aligned. */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <RedeemInAppNote />
          <SaveDealButton dealId={deal.id} initialSaved={initialSaved} />
        </div>
      </div>
    </li>
  );
}
