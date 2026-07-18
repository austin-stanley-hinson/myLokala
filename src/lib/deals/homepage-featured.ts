import type { Deal } from "@/types/deal";

const FEATURED_COUNT = 6;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Higher score = better fit for compact homepage plaques.
 * Prefers shorter business names/titles and avoids bulky duplicate copy.
 * Display-only heuristic — does not mutate or hide deals elsewhere.
 */
export function scoreHomepageDeal(deal: Deal): number {
  const businessName = deal.business_name?.trim() ?? "";
  const title = deal.title?.trim() ?? "";
  const discount = deal.discount_detail?.trim() ?? "";
  const nameLen = businessName.length;
  const titleLen = title.length;
  const discountLen = discount.length;
  const discountDuplicatesTitle =
    discountLen > 0 && normalizeText(discount) === normalizeText(title);

  let score = 100;

  if (deal.is_active === false) score -= 1000;

  // Prefer short, scannable business names.
  if (nameLen === 0) score -= 20;
  else if (nameLen > 32) score -= (nameLen - 32) * 4;
  else if (nameLen > 22) score -= (nameLen - 22) * 2.5;
  else if (nameLen <= 18) score += 8;

  // Prefer compact titles.
  if (titleLen === 0) score -= 15;
  else if (titleLen > 56) score -= (titleLen - 56) * 2.5;
  else if (titleLen > 36) score -= (titleLen - 36) * 1.5;
  else if (titleLen <= 28) score += 6;

  // Long unique discount lines make cards tall; short distinct ones are fine.
  if (discountDuplicatesTitle) {
    score += 4;
  } else if (discountLen > 48) {
    score -= (discountLen - 48) * 2;
  } else if (discountLen > 28) {
    score -= (discountLen - 28) * 1.2;
  } else if (discountLen > 0 && discountLen <= 24) {
    score += 5;
  }

  // Mild bonus when both name and title stay in the compact band together.
  if (nameLen > 0 && nameLen <= 22 && titleLen > 0 && titleLen <= 36) {
    score += 6;
  }

  return score;
}

/**
 * Pick a polished homepage featured set from candidate active deals.
 * Prefers visually compact deals and lightly spreads categories when possible.
 * Browse remains responsible for showing the full catalog.
 */
export function getHomepageFeaturedDeals(
  deals: Deal[],
  limit: number = FEATURED_COUNT,
): Deal[] {
  if (deals.length === 0) return [];
  if (deals.length <= limit) return [...deals];

  const ranked = [...deals].sort((a, b) => {
    const scoreDiff = scoreHomepageDeal(b) - scoreHomepageDeal(a);
    if (scoreDiff !== 0) return scoreDiff;
    // Stable-ish tie-break: newer first when scores match.
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return bTime - aTime;
  });

  const selected: Deal[] = [];
  const categoryCounts = new Map<string, number>();
  const maxPerCategory = Math.max(1, Math.ceil(limit / 3));

  // First pass: prefer category variety among strong candidates.
  for (const deal of ranked) {
    if (selected.length >= limit) break;
    const category = deal.category?.trim() || "__none__";
    const count = categoryCounts.get(category) ?? 0;
    if (count >= maxPerCategory) continue;
    selected.push(deal);
    categoryCounts.set(category, count + 1);
  }

  // Fill remaining slots with next-best deals regardless of category.
  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((deal) => deal.id));
    for (const deal of ranked) {
      if (selected.length >= limit) break;
      if (selectedIds.has(deal.id)) continue;
      selected.push(deal);
    }
  }

  return selected;
}
