/**
 * mmcc-import: parsing/normalization and import orchestration. Run with
 * `npm test`.
 *
 * Every orchestration test injects a fake CatalogImportDeps (an in-memory
 * map), so this stays fully offline -- no live database. The idempotent
 * upsert behavior against a REAL local Postgres (two full runs producing
 * identical table counts) is proven separately, against local Supabase,
 * as part of the checkpoint's dry run -- a fake in-memory upsert can prove
 * the orchestration calls the right upsert with the right key, but not that
 * Postgres's own ON CONFLICT semantics behave as expected.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importMmccCatalog, normalizeMmccDealRow, type MmccExportRow } from "./mmcc-import.ts";

function row(over: Partial<MmccExportRow> = {}): MmccExportRow {
  return {
    legacy_deal_id: "11111111-1111-1111-1111-111111111111",
    business_name: "3D Stitchery",
    title: "10% Off Entire Purchase",
    subtitle: "Show Lokala card at checkout",
    discount_detail: "10% off entire purchase",
    expires_at: "Ongoing",
    category: "retail",
    distance_meters: 1600,
    percent_off: 10,
    address: "Waterville, ME",
    phone: null,
    website: null,
    is_active: true,
    created_at: "2026-06-07T17:39:05.81411+00:00",
    latitude: 44.5546277,
    longitude: -69.6297798,
    ...over,
  };
}

describe("normalizeMmccDealRow: offer_type derivation", () => {
  it("a row with percent_off maps to offer_type 'percentage'", () => {
    const deal = normalizeMmccDealRow(row({ percent_off: 15 }));
    assert.equal(deal.offerType, "percentage");
    assert.equal(deal.percentOff, 15);
  });

  it("a row with null percent_off maps to offer_type 'flat' with percentOff null", () => {
    const deal = normalizeMmccDealRow(row({ percent_off: null }));
    assert.equal(deal.offerType, "flat");
    assert.equal(deal.percentOff, null);
  });

  it("preserves title/subtitle/discount_detail verbatim, no editorial changes", () => {
    const deal = normalizeMmccDealRow(
      row({
        title: "Buy 1 Swim Pass Get 1 Free",
        subtitle: null,
        discount_detail: "Buy one Swim and Fitness daily pass and get one free. Limit ONE pass per person daily.",
      }),
    );
    assert.equal(deal.title, "Buy 1 Swim Pass Get 1 Free");
    assert.equal(deal.subtitle, null);
    assert.equal(
      deal.discountDetail,
      "Buy one Swim and Fitness daily pass and get one free. Limit ONE pass per person daily.",
    );
  });

  it("maps is_active false to status 'inactive' (the current export has none, but the mapping must still be correct)", () => {
    const deal = normalizeMmccDealRow(row({ is_active: false }));
    assert.equal(deal.status, "inactive");
  });
});

function makeFakeDeps() {
  const businesses = new Map<string, { id: string; name: string }>();
  const locations = new Map<string, { id: string; businessId: string; address: string }>();
  const deals = new Map<string, { id: string; locationId: string; title: string }>();
  const businessCalls: string[] = [];
  const locationCalls: string[] = [];
  const dealCalls: string[] = [];
  let nextId = 1;

  return {
    businesses,
    locations,
    deals,
    businessCalls,
    locationCalls,
    dealCalls,
    async upsertBusiness(businessName: string) {
      businessCalls.push(businessName);
      const existing = [...businesses.values()].find((b) => b.name === businessName);
      if (existing) return { id: existing.id };
      const id = `biz-${nextId++}`;
      businesses.set(id, { id, name: businessName });
      return { id };
    },
    async upsertLocation(args: { businessId: string; address: string }) {
      locationCalls.push(`${args.businessId}|${args.address}`);
      const existing = [...locations.values()].find(
        (l) => l.businessId === args.businessId && l.address === args.address,
      );
      if (existing) return { id: existing.id };
      const id = `loc-${nextId++}`;
      locations.set(id, { id, businessId: args.businessId, address: args.address });
      return { id };
    },
    async upsertDeal(args: { legacyDealId: string; locationId: string; title: string }) {
      dealCalls.push(args.legacyDealId);
      const existing = deals.get(args.legacyDealId);
      if (existing) {
        existing.locationId = args.locationId;
        existing.title = args.title;
        return { id: existing.id };
      }
      const id = `deal-${nextId++}`;
      deals.set(args.legacyDealId, { id, locationId: args.locationId, title: args.title });
      return { id };
    },
  };
}

describe("importMmccCatalog: business/location deduplication within one run", () => {
  it("Silver Street Tavern's two deal rows upsert the business and location exactly once each, but two distinct deals", async () => {
    const deps = makeFakeDeps();
    const rows = [
      row({
        legacy_deal_id: "1d81fb3c-06dc-4a9c-bba6-93e9ebe24c19",
        business_name: "Silver Street Tavern",
        address: "2 Silver St, Waterville ME",
        latitude: 44.548894,
        longitude: -69.629304,
        title: "10% Off Food Order",
        discount_detail: "10% off food order. Excludes alcohol. Dine in only.",
        category: "drinks",
        percent_off: 10,
      }),
      row({
        legacy_deal_id: "784049cc-86ea-44f2-b599-cb8f36b4e376",
        business_name: "Silver Street Tavern",
        address: "2 Silver St, Waterville ME",
        latitude: 44.548894,
        longitude: -69.629304,
        title: "10% Off Food Order",
        discount_detail: "10% off food order. Excludes alcohol. Dine in only.",
        category: "drinks",
        percent_off: 10,
      }),
    ];

    const summary = await importMmccCatalog(rows, deps);

    assert.equal(summary.businessesUpserted, 1);
    assert.equal(summary.locationsUpserted, 1);
    assert.equal(summary.dealsUpserted, 2);
    assert.equal(deps.businessCalls.length, 1);
    assert.equal(deps.locationCalls.length, 1);
    assert.equal(deps.dealCalls.length, 2);
    assert.equal(deps.deals.size, 2);
    assert.equal(deps.businesses.size, 1);
    assert.equal(deps.locations.size, 1);
  });

  it("two different businesses at the same literal address string are not merged into one location", async () => {
    const deps = makeFakeDeps();
    const rows = [
      row({ legacy_deal_id: "a", business_name: "Business A", address: "Waterville, ME" }),
      row({ legacy_deal_id: "b", business_name: "Business B", address: "Waterville, ME" }),
    ];

    const summary = await importMmccCatalog(rows, deps);

    assert.equal(summary.businessesUpserted, 2);
    assert.equal(summary.locationsUpserted, 2);
    assert.equal(deps.locations.size, 2);
  });
});

describe("importMmccCatalog: idempotent replay within one process", () => {
  it("importing the same rows twice does not grow business/location/deal counts", async () => {
    const deps = makeFakeDeps();
    const rows = [
      row({ legacy_deal_id: "a", business_name: "Business A" }),
      row({ legacy_deal_id: "b", business_name: "Business B", address: "123 Other St" }),
    ];

    await importMmccCatalog(rows, deps);
    const businessesAfterFirst = deps.businesses.size;
    const locationsAfterFirst = deps.locations.size;
    const dealsAfterFirst = deps.deals.size;

    const secondSummary = await importMmccCatalog(rows, deps);

    assert.equal(deps.businesses.size, businessesAfterFirst);
    assert.equal(deps.locations.size, locationsAfterFirst);
    assert.equal(deps.deals.size, dealsAfterFirst);
    assert.equal(secondSummary.errors.length, 0);
  });
});

describe("importMmccCatalog: one bad row does not stop the batch", () => {
  it("a row whose upsertDeal rejects is recorded in errors, other rows still import", async () => {
    const deps = makeFakeDeps();
    const originalUpsertDeal = deps.upsertDeal.bind(deps);
    deps.upsertDeal = (async (args: { legacyDealId: string; locationId: string; title: string }) => {
      if (args.legacyDealId === "bad") throw new Error("simulated constraint violation");
      return originalUpsertDeal(args);
    }) as typeof deps.upsertDeal;

    const rows = [
      row({ legacy_deal_id: "good-1", business_name: "Business A" }),
      row({ legacy_deal_id: "bad", business_name: "Business B", address: "123 Other St" }),
      row({ legacy_deal_id: "good-2", business_name: "Business C", address: "456 Third St" }),
    ];

    const summary = await importMmccCatalog(rows, deps);

    assert.equal(summary.errors.length, 1);
    assert.equal(summary.errors[0]!.legacyDealId, "bad");
    assert.equal(summary.dealsUpserted, 2);
    assert.equal(deps.deals.has("good-1"), true);
    assert.equal(deps.deals.has("good-2"), true);
    assert.equal(deps.deals.has("bad"), false);
  });
});
