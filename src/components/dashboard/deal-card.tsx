import { RedeemInAppNote } from "@/components/deals/redeem-in-app-note";
import { formatExpiry, type Deal } from "@/types/deal";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compact homepage deal plaque (discovery-only). Presentational.
 *
 * Hierarchy: business name + Active badge → deal title → optional discount →
 * metadata (category · expiry · location) → “Redeem in Lokala app” helper.
 * No fake merchant logo thumbnails, no public save/redeem actions.
 */
export function DealCard({ deal }: { deal: Deal }) {
  const active = deal.is_active !== false;
  const businessName = deal.business_name?.trim() || "Local business";
  const title = deal.title?.trim() || "Local offer";
  const discount = deal.discount_detail?.trim() || null;

  // Show discount only when it adds information beyond the title.
  const showDiscount =
    Boolean(discount) && normalizeText(discount) !== normalizeText(title);

  const category = deal.category?.trim() || null;
  const expiry = formatExpiry(deal.expires_at);
  const location = deal.address?.trim() || "Waterville, ME";

  const metaParts = [category, expiry !== "—" ? expiry : null, location].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-lokala-border bg-white p-4 shadow-lokala-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lokala-lift">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-extrabold leading-snug text-lokala-brown-dark">
          {businessName}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
            active
              ? "bg-lokala-green-light text-lokala-green-dark"
              : "bg-lokala-brown-soft text-lokala-brown"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              active ? "bg-lokala-green-dark" : "bg-lokala-brown"
            }`}
            aria-hidden
          />
          {active ? "Active" : "Inactive"}
        </span>
      </div>

      <h3 className="line-clamp-2 text-[1.05rem] font-extrabold leading-snug text-lokala-brown-dark">
        {title}
      </h3>

      {showDiscount ? (
        <p className="w-fit rounded-lg border border-lokala-border bg-lokala-cream px-2.5 py-1 text-xs font-bold text-lokala-brown">
          {discount}
        </p>
      ) : null}

      {metaParts.length > 0 ? (
        <p className="text-xs font-semibold leading-5 text-lokala-muted">
          {metaParts.map((part, index) => (
            <span key={`${part}-${index}`}>
              {index > 0 ? (
                <span className="mx-1.5 text-lokala-border" aria-hidden>
                  ·
                </span>
              ) : null}
              {part}
            </span>
          ))}
        </p>
      ) : null}

      <div className="pt-0.5">
        <RedeemInAppNote />
      </div>
    </li>
  );
}
