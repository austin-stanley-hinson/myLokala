import Image from "next/image";
import Link from "next/link";
import { Clock, Globe, MapPin } from "lucide-react";

import { RedeemInAppNote } from "@/components/deals/redeem-in-app-note";
import { Badge } from "@/components/dashboard/badge";
import { cn } from "@/lib/utils";
import { formatExpiry, type Deal } from "@/types/deal";

/**
 * Compact homepage deal plaque (discovery-only). Presentational.
 *
 * No customer save/redeem actions on web. Discount/value is shown once.
 * Closes with a non-interactive “Redeem in Lokala app” notice.
 */
export function DealCard({ deal }: { deal: Deal }) {
  const active = deal.is_active !== false;
  const title = deal.title?.trim() || "Local offer";
  const discount = deal.discount_detail?.trim() || null;
  const subtitle = deal.subtitle?.trim() || null;

  // Avoid repeating the same value across title / subtitle / discount chip.
  const showSubtitle =
    Boolean(subtitle) && subtitle !== title && subtitle !== discount;
  const showDiscount = Boolean(discount) && discount !== title;

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-lokala-border bg-white p-4 shadow-lokala-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lokala-lift">
      <div className="flex items-start gap-2.5">
        {/* Single cream tile — the mark sits inside one container (no nested
            white-on-white shapes). Note: logo-try-1.png itself has a baked
            near-white background; see report. */}
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-lokala-cream">
          <Image
            src="/logo-try-1.png"
            alt=""
            width={36}
            height={36}
            className="size-9 object-cover"
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
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

          <h3 className="mt-0.5 line-clamp-2 text-base font-extrabold leading-snug text-lokala-brown-dark">
            {title}
          </h3>
          {showSubtitle ? (
            <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-lokala-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {(showDiscount || deal.category) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {showDiscount ? (
            <p className="w-fit rounded-lg bg-lokala-green-light px-2.5 py-1 text-sm font-extrabold text-lokala-green-dark">
              {discount}
            </p>
          ) : null}
          {deal.category ? (
            <Badge variant="category">{deal.category}</Badge>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-1 text-xs font-semibold text-lokala-muted">
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

      <div className="pt-1">
        <RedeemInAppNote />
      </div>
    </li>
  );
}
