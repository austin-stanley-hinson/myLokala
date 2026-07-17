import Image from "next/image";
import Link from "next/link";
import { Clock, Globe, MapPin } from "lucide-react";

import { RedeemInAppNote } from "@/components/deals/redeem-in-app-note";
import { Badge } from "@/components/dashboard/badge";
import { cn } from "@/lib/utils";
import { formatExpiry, type Deal } from "@/types/deal";

/**
 * Compact homepage deal card (discovery-only). Presentational.
 *
 * The web has no per-deal image and no customer save/redeem actions, so the
 * card leads with a small brand tile + business name rather than a large empty
 * thumbnail, and closes with a subtle "Redeem in the Lokala mobile app" note
 * pinned to the bottom so cards in a row stay aligned without dead space.
 */
export function DealCard({ deal }: { deal: Deal }) {
  const active = deal.is_active !== false;

  return (
    <li className="flex flex-col gap-3 rounded-[1.5rem] border border-lokala-border bg-white p-5 shadow-lokala-card transition duration-200 hover:-translate-y-1 hover:shadow-lokala-lift">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-lokala-border bg-lokala-cream">
          <Image
            src="/logo-try-1.png"
            alt=""
            width={44}
            height={44}
            className="size-8 object-contain"
          />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-lokala-brown">
          {deal.business_name ?? "Local business"}
        </p>
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

      <div>
        <h3 className="line-clamp-2 text-lg font-extrabold leading-snug text-lokala-brown-dark">
          {deal.title ?? "Local offer"}
        </h3>
        {deal.subtitle ? (
          <p className="mt-1 line-clamp-1 text-sm font-semibold text-lokala-muted">
            {deal.subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {deal.discount_detail ? (
          <p className="w-fit rounded-xl bg-lokala-green-light px-3 py-1.5 text-base font-extrabold text-lokala-green-dark">
            {deal.discount_detail}
          </p>
        ) : null}
        {deal.category ? <Badge variant="category">{deal.category}</Badge> : null}
      </div>

      <div className="flex flex-col gap-1.5 text-xs font-semibold text-lokala-muted">
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

      <div className="mt-auto border-t border-lokala-border pt-3">
        <RedeemInAppNote />
      </div>
    </li>
  );
}
