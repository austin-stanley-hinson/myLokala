import { RedeemInAppNote } from "@/components/deals/redeem-in-app-note";
import { formatExpiry, type Deal } from "@/types/deal";

/** Homepage supporting discount pills stay short so cards stay even. */
const MAX_HOMEPAGE_DISCOUNT_LEN = 28;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compact homepage deal plaque (discovery-only). Presentational.
 *
 * Fixed visual budget: business name and title each clamp to 2 lines, optional
 * short discount only when distinct, then a single meta line + redeem helper.
 * Cards stretch to equal height in the grid via h-full + flex.
 */
export function DealCard({ deal }: { deal: Deal }) {
  const active = deal.is_active !== false;
  const businessName = deal.business_name?.trim() || "Local business";
  const title = deal.title?.trim() || "Local offer";
  const discount = deal.discount_detail?.trim() || null;

  const discountDuplicatesTitle =
    Boolean(discount) && normalizeText(discount) === normalizeText(title);

  // Homepage: hide redundant or long discount copy so plaques stay balanced.
  const showDiscount =
    Boolean(discount) &&
    !discountDuplicatesTitle &&
    (discount?.length ?? 0) <= MAX_HOMEPAGE_DISCOUNT_LEN;

  const category = deal.category?.trim() || null;
  const expiry = formatExpiry(deal.expires_at);
  const location = deal.address?.trim() || "Waterville, ME";

  const metaParts = [category, expiry !== "—" ? expiry : null, location].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <li className="flex h-full flex-col gap-2 rounded-2xl border border-lokala-border bg-white p-4 shadow-lokala-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lokala-lift">
      <div className="flex items-start justify-between gap-3">
        <p
          title={businessName}
          className="min-w-0 flex-1 line-clamp-2 text-sm font-extrabold leading-snug text-lokala-brown-dark"
        >
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

      <h3
        title={title}
        className="line-clamp-2 text-[1.05rem] font-extrabold leading-snug text-lokala-brown-dark"
      >
        {title}
      </h3>

      {/* Reserve a short slot so cards with/without discount stay similar height */}
      <div className="min-h-[1.5rem]">
        {showDiscount ? (
          <p
            title={discount ?? undefined}
            className="w-fit max-w-full truncate rounded-lg border border-lokala-border bg-lokala-cream px-2.5 py-1 text-xs font-bold text-lokala-brown"
          >
            {discount}
          </p>
        ) : null}
      </div>

      {metaParts.length > 0 ? (
        <p
          title={metaParts.join(" · ")}
          className="line-clamp-1 text-xs font-semibold leading-5 text-lokala-muted"
        >
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
      ) : (
        <p className="min-h-5 text-xs" aria-hidden />
      )}

      <div className="mt-auto pt-1">
        <RedeemInAppNote />
      </div>
    </li>
  );
}
