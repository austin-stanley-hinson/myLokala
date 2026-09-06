/**
 * Public deal-browsing marketplace (MMCC catalog). Browse-only: no redeem
 * action lives on web -- redemption only exists in the mobile app, per
 * product design. Reads go through the anon-safe catalog_*_select_active
 * RLS policies (migration 20260901000019); no service-role client is
 * involved anywhere in this module or its caller.
 *
 * Kept separate from the page component so the category-filter logic and
 * the row -> card-view-model mapping (including the Silver Street Tavern
 * non-dedup behavior) are plain, unit-testable functions rather than logic
 * buried in JSX.
 */

/** The fixed category set confirmed against the real 2026-08-29 legacy
 * export (95 rows, no others observed). Not enforced by a database enum
 * (category is a plain non-empty text column) -- if a later import
 * introduces a new category, its deals still render (mapCatalogDealRow
 * passes category through verbatim), they just won't get their own filter
 * chip until this list is updated. */
export const CATALOG_CATEGORIES = [
  "auto",
  "coffee",
  "drinks",
  "food",
  "health",
  "retail",
  "services",
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

/** Shape of one row from the catalog_deals + catalog_locations +
 * catalog_businesses embedded-resource query the browse page issues. */
export type CatalogDealJoinRow = {
  id: string;
  legacy_deal_id: string;
  title: string;
  subtitle: string | null;
  discount_detail: string;
  offer_type: string;
  percent_off: number | null;
  category: string;
  expires_at: string | null;
  catalog_locations: {
    address: string;
    catalog_businesses: {
      business_name: string;
    } | null;
  } | null;
};

/** Card view model: one per catalog_deals row. Two deals sharing a
 * business/location (Silver Street Tavern) map to two distinct entries
 * here, keyed by their own `id` -- nothing in this mapping groups or
 * dedupes by business or location. */
export type CatalogDealCardData = {
  id: string;
  legacyDealId: string;
  businessName: string;
  address: string;
  title: string;
  subtitle: string | null;
  discountDetail: string;
  offerType: string;
  percentOff: number | null;
  category: string;
  expiresAt: string | null;
};

const UNKNOWN_BUSINESS_NAME = "Local business";
const UNKNOWN_ADDRESS = "Address unavailable";

export function mapCatalogDealRow(row: CatalogDealJoinRow): CatalogDealCardData {
  return {
    id: row.id,
    legacyDealId: row.legacy_deal_id,
    businessName: row.catalog_locations?.catalog_businesses?.business_name ?? UNKNOWN_BUSINESS_NAME,
    address: row.catalog_locations?.address ?? UNKNOWN_ADDRESS,
    title: row.title,
    subtitle: row.subtitle,
    discountDetail: row.discount_detail,
    offerType: row.offer_type,
    percentOff: row.percent_off,
    category: row.category,
    expiresAt: row.expires_at,
  };
}

/** `null` (or any value not in CATALOG_CATEGORIES) means "all categories" --
 * the caller doesn't need to validate the searchParams value before calling
 * this, an unrecognized category simply shows everything rather than an
 * empty or broken page. */
export function filterDealsByCategory(
  deals: CatalogDealCardData[],
  category: string | null | undefined,
): CatalogDealCardData[] {
  if (!category || !isCatalogCategory(category)) return deals;
  return deals.filter((deal) => deal.category === category);
}

export function isCatalogCategory(value: string): value is CatalogCategory {
  return (CATALOG_CATEGORIES as readonly string[]).includes(value);
}

/** Percent-off deals show "10% off"; flat deals show just the discount
 * detail (which already carries the dollar amount or offer description
 * verbatim, e.g. "$10 off any birthday party package") -- there is no
 * separate flat-dollar-amount field to format on its own. */
export function formatOfferBadge(deal: Pick<CatalogDealCardData, "offerType" | "percentOff">): string | null {
  if (deal.offerType === "percentage" && deal.percentOff !== null) {
    return `${deal.percentOff}% off`;
  }
  return null;
}
