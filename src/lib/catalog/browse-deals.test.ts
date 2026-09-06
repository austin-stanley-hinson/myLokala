/**
 * browse-deals: category filter and row -> card-view-model mapping for the
 * public MMCC catalog marketplace page. Run with `npm test`.
 *
 * There is no React component-rendering test harness in this codebase
 * (no .test.tsx files, no jsdom/testing-library dependency) -- every other
 * test here proves logic through plain functions instead of rendering JSX,
 * and this file follows the same convention. The browse page renders
 * exactly one <DealCard> per entry in the array these functions produce,
 * so proving "Silver Street Tavern renders as two distinct cards, not one"
 * is proving that mapping/filtering never collapses its two rows into one
 * array entry.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CATALOG_CATEGORIES,
  filterDealsByCategory,
  formatOfferBadge,
  isCatalogCategory,
  mapCatalogDealRow,
  type CatalogDealCardData,
  type CatalogDealJoinRow,
} from "./browse-deals.ts";

function joinRow(over: Partial<CatalogDealJoinRow> = {}): CatalogDealJoinRow {
  return {
    id: "deal-1",
    legacy_deal_id: "17772ad8-5920-4b98-aca3-abd39f3b4e49",
    title: "10% Off Entire Purchase",
    subtitle: "Show Lokala card at checkout",
    discount_detail: "10% off entire purchase",
    offer_type: "percentage",
    percent_off: 10,
    category: "retail",
    expires_at: "Ongoing",
    catalog_locations: {
      address: "Waterville, ME",
      catalog_businesses: { business_name: "3D Stitchery" },
    },
    ...over,
  };
}

function card(over: Partial<CatalogDealCardData> = {}): CatalogDealCardData {
  return {
    id: "deal-1",
    legacyDealId: "17772ad8-5920-4b98-aca3-abd39f3b4e49",
    businessName: "3D Stitchery",
    address: "Waterville, ME",
    title: "10% Off Entire Purchase",
    subtitle: "Show Lokala card at checkout",
    discountDetail: "10% off entire purchase",
    offerType: "percentage",
    percentOff: 10,
    category: "retail",
    expiresAt: "Ongoing",
    ...over,
  };
}

describe("mapCatalogDealRow", () => {
  it("maps a joined row to a card view model, preserving text fields verbatim", () => {
    const result = mapCatalogDealRow(
      joinRow({
        title: "Buy 1 Swim Pass Get 1 Free",
        discount_detail: "Buy one Swim and Fitness daily pass and get one free. Limit ONE pass per person daily.",
        offer_type: "flat",
        percent_off: null,
      }),
    );

    assert.equal(result.title, "Buy 1 Swim Pass Get 1 Free");
    assert.equal(
      result.discountDetail,
      "Buy one Swim and Fitness daily pass and get one free. Limit ONE pass per person daily.",
    );
    assert.equal(result.offerType, "flat");
    assert.equal(result.percentOff, null);
  });

  it("falls back to a placeholder business name/address if the join is somehow missing (never crashes)", () => {
    const result = mapCatalogDealRow(joinRow({ catalog_locations: null }));
    assert.equal(result.businessName, "Local business");
    assert.equal(result.address, "Address unavailable");
  });

  it("falls back to a placeholder business name if the location exists but the business join is missing", () => {
    const result = mapCatalogDealRow(
      joinRow({ catalog_locations: { address: "1 Main St", catalog_businesses: null } }),
    );
    assert.equal(result.businessName, "Local business");
    assert.equal(result.address, "1 Main St");
  });
});

describe("Silver Street Tavern: two distinct deal rows map to two distinct cards", () => {
  it("both legacy_deal_id rows survive mapping as separate array entries, not merged", () => {
    const rows: CatalogDealJoinRow[] = [
      joinRow({
        id: "deal-silver-1",
        legacy_deal_id: "1d81fb3c-06dc-4a9c-bba6-93e9ebe24c19",
        title: "10% Off Food Order",
        discount_detail: "10% off food order. Excludes alcohol. Dine in only.",
        category: "drinks",
        catalog_locations: {
          address: "2 Silver St, Waterville ME",
          catalog_businesses: { business_name: "Silver Street Tavern" },
        },
      }),
      joinRow({
        id: "deal-silver-2",
        legacy_deal_id: "784049cc-86ea-44f2-b599-cb8f36b4e376",
        title: "10% Off Food Order",
        discount_detail: "10% off food order. Excludes alcohol. Dine in only.",
        category: "drinks",
        catalog_locations: {
          address: "2 Silver St, Waterville ME",
          catalog_businesses: { business_name: "Silver Street Tavern" },
        },
      }),
    ];

    const cards = rows.map(mapCatalogDealRow);

    assert.equal(cards.length, 2, "two source rows must produce two card entries, not one deduplicated entry");
    assert.notEqual(cards[0]!.id, cards[1]!.id);
    assert.deepEqual(
      cards.map((c) => c.legacyDealId).sort(),
      ["1d81fb3c-06dc-4a9c-bba6-93e9ebe24c19", "784049cc-86ea-44f2-b599-cb8f36b4e376"].sort(),
    );
    // Both still carry the same shared business/address -- the point is
    // that sharing a business does not collapse the deals, not that they
    // must differ in every field.
    assert.equal(cards[0]!.businessName, "Silver Street Tavern");
    assert.equal(cards[1]!.businessName, "Silver Street Tavern");
  });

  it("filtering by category keeps both Silver Street cards together (same category)", () => {
    const cards = [
      card({ id: "s1", legacyDealId: "1d81fb3c-06dc-4a9c-bba6-93e9ebe24c19", category: "drinks", businessName: "Silver Street Tavern" }),
      card({ id: "s2", legacyDealId: "784049cc-86ea-44f2-b599-cb8f36b4e376", category: "drinks", businessName: "Silver Street Tavern" }),
      card({ id: "other", category: "retail", businessName: "3D Stitchery" }),
    ];

    const filtered = filterDealsByCategory(cards, "drinks");

    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered.map((c) => c.id).sort(), ["s1", "s2"]);
  });
});

describe("filterDealsByCategory", () => {
  const deals = [
    card({ id: "a", category: "food" }),
    card({ id: "b", category: "retail" }),
    card({ id: "c", category: "food" }),
  ];

  it("returns every deal when category is null", () => {
    assert.equal(filterDealsByCategory(deals, null).length, 3);
  });

  it("returns every deal when category is undefined", () => {
    assert.equal(filterDealsByCategory(deals, undefined).length, 3);
  });

  it("returns only deals matching the given category", () => {
    const result = filterDealsByCategory(deals, "food");
    assert.deepEqual(result.map((d) => d.id), ["a", "c"]);
  });

  it("returns every deal for an unrecognized category value rather than an empty page", () => {
    const result = filterDealsByCategory(deals, "not-a-real-category");
    assert.equal(result.length, 3);
  });

  it("returns an empty array for a recognized category with no matching deals", () => {
    const result = filterDealsByCategory(deals, "auto");
    assert.equal(result.length, 0);
  });
});

describe("isCatalogCategory", () => {
  it("accepts every category in the fixed set", () => {
    for (const category of CATALOG_CATEGORIES) {
      assert.equal(isCatalogCategory(category), true);
    }
  });

  it("rejects an arbitrary string", () => {
    assert.equal(isCatalogCategory("not-a-category"), false);
  });
});

describe("formatOfferBadge", () => {
  it("formats a percentage offer as 'N% off'", () => {
    assert.equal(formatOfferBadge({ offerType: "percentage", percentOff: 15 }), "15% off");
  });

  it("returns null for a flat offer (its detail is already in discount_detail)", () => {
    assert.equal(formatOfferBadge({ offerType: "flat", percentOff: null }), null);
  });
});
