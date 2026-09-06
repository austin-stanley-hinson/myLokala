import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createClient } from "@/lib/supabase/server";

export type PublicQrBusiness = {
  public_code: string;
  business_name: string;
  business_address: string | null;
};

/**
 * Safe public lookup for an active QR code via SECURITY DEFINER RPC.
 * Does not use (or require) anon SELECT on business_qr_codes.
 */
export async function lookupBusinessForQrCode(
  publicCode: string,
): Promise<PublicQrBusiness | null> {
  const code = publicCode.trim();
  if (!code) return null;

  if (!hasPublicSupabaseEnv()) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_business_for_qr_code", {
    input_public_code: code,
  });

  if (error || !data) return null;

  // rpc may return a row object or a one-element array depending on client.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  const record = row as {
    public_code?: string | null;
    business_name?: string | null;
    business_address?: string | null;
  };

  if (!record.public_code || !record.business_name) return null;

  return {
    public_code: record.public_code,
    business_name: record.business_name,
    business_address: record.business_address ?? null,
  };
}
