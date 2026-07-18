import { randomBytes } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { SITE_URL } from "@/lib/seo";

export type BusinessQrCode = {
  id: string;
  business_owner_id: string;
  public_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BusinessQrResult =
  | {
      ok: true;
      qr: BusinessQrCode;
      paymentUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

const QR_COLUMNS =
  "id, business_owner_id, public_code, is_active, created_at, updated_at";

/** Build the permanent customer-facing pay URL (public_code only — no UUIDs). */
export function buildBusinessPaymentUrl(publicCode: string): string {
  return `${SITE_URL}/pay/${encodeURIComponent(publicCode)}`;
}

/**
 * Cryptographically random URL-safe public code (no private UUIDs).
 * ~16 chars of base64url from 12 random bytes.
 */
export function generatePublicCode(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Get the business owner's active QR code, or create one if none exists.
 * Safe to call on every page load — never inserts when an active row exists.
 * Race-safe against the partial unique index (one active QR per owner).
 */
export async function getOrCreateActiveBusinessQrCode(
  supabase: SupabaseClient,
  businessOwnerId: string,
): Promise<BusinessQrResult> {
  const { data: existing, error: selectError } = await supabase
    .from("business_qr_codes")
    .select(QR_COLUMNS)
    .eq("business_owner_id", businessOwnerId)
    .eq("is_active", true)
    .maybeSingle<BusinessQrCode>();

  if (selectError) {
    return {
      ok: false,
      error:
        "Could not load your QR code. If you just added the database table, apply the business_qr_codes migration in Supabase, then try again.",
    };
  }

  if (existing) {
    return {
      ok: true,
      qr: existing,
      paymentUrl: buildBusinessPaymentUrl(existing.public_code),
    };
  }

  // Insert a new active code. On unique-violation (race), re-select the winner.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicCode = generatePublicCode();
    const { data: created, error: insertError } = await supabase
      .from("business_qr_codes")
      .insert({
        business_owner_id: businessOwnerId,
        public_code: publicCode,
        is_active: true,
      })
      .select(QR_COLUMNS)
      .single<BusinessQrCode>();

    if (!insertError && created) {
      return {
        ok: true,
        qr: created,
        paymentUrl: buildBusinessPaymentUrl(created.public_code),
      };
    }

    // Unique violation on (active owner) or public_code — another request won,
    // or we hit a rare code collision. Prefer returning the active row.
    const { data: raced, error: raceSelectError } = await supabase
      .from("business_qr_codes")
      .select(QR_COLUMNS)
      .eq("business_owner_id", businessOwnerId)
      .eq("is_active", true)
      .maybeSingle<BusinessQrCode>();

    if (!raceSelectError && raced) {
      return {
        ok: true,
        qr: raced,
        paymentUrl: buildBusinessPaymentUrl(raced.public_code),
      };
    }

    // Only retry on public_code collision with no active row yet.
    const isUniqueViolation = insertError?.code === "23505";
    if (!isUniqueViolation) {
      const isFkViolation = insertError?.code === "23503";
      return {
        ok: false,
        error: isFkViolation
          ? "Your business profile is not ready yet. Open Business profile, save your details, then return here."
          : (insertError?.message ??
            "Could not create your QR code. Please try again in a moment."),
      };
    }
  }

  return {
    ok: false,
    error: "Could not create your QR code. Please try again in a moment.",
  };
}
