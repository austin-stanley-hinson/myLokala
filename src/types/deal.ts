/**
 * Mirrors the mobile app's `deals` table (the source of truth).
 * See docs/mobile-db-schema.md — do not add columns that do not exist there.
 */
export type Deal = {
  id: string;
  business_name: string | null;
  title: string | null;
  discount_detail: string | null;
  category: string | null;
  is_active: boolean | null;
  expires_at: string | null;
  created_at: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
};

/** Columns selected for deal listings (homepage / browse). */
export const DEAL_LIST_COLUMNS =
  "id, business_name, title, discount_detail, category, is_active, expires_at, created_at, address, phone, website";

/**
 * Mirrors the mobile app's `redemptions` table. Deal details are denormalized
 * (snapshotted) at redemption time.
 */
export type Redemption = {
  id: string;
  user_id: string;
  deal_id: string;
  business_name: string | null;
  deal_title: string | null;
  discount_detail: string | null;
  category: string | null;
  redeemed_at: string | null;
};
