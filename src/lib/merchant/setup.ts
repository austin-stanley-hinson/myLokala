import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { NormalizedLocation, NormalizedProfile } from "./validation.ts";
import { merchantSetupErrorMessage } from "./validation.ts";

type TypedClient = SupabaseClient<Database>;

type RpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type LocationRow =
  Database["public"]["Tables"]["merchant_locations"]["Row"];

export type PaymentHubRow =
  Database["public"]["Tables"]["payment_hubs"]["Row"];

export type LocationWithHub = {
  location: LocationRow;
  hub: PaymentHubRow | null;
};

export async function listMerchantLocations(
  supabase: TypedClient,
  merchantAccountId: string,
): Promise<LocationRow[]> {
  const { data, error } = await supabase
    .from("merchant_locations")
    .select("*")
    .eq("merchant_account_id", merchantAccountId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data;
}

export async function getMerchantLocation(
  supabase: TypedClient,
  locationId: string,
): Promise<LocationRow | null> {
  const { data, error } = await supabase
    .from("merchant_locations")
    .select("*")
    .eq("id", locationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function listPaymentHubsForLocations(
  supabase: TypedClient,
  locationIds: string[],
): Promise<PaymentHubRow[]> {
  if (locationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("payment_hubs")
    .select("*")
    .in("merchant_location_id", locationIds)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data;
}

export function hubForLocation(
  hubs: PaymentHubRow[],
  locationId: string,
): PaymentHubRow | null {
  const forLocation = hubs.filter((hub) => hub.merchant_location_id === locationId);
  return (
    forLocation.find((hub) => hub.status === "active") ??
    forLocation.at(-1) ??
    null
  );
}

export type UpdateProfileResult = RpcResult<{ merchantAccountId: string }>;

export async function updateMerchantProfile(
  supabase: TypedClient,
  merchantAccountId: string,
  input: NormalizedProfile,
): Promise<UpdateProfileResult> {
  const { data, error } = await supabase.rpc("update_merchant_profile", {
    p_merchant_account_id: merchantAccountId,
    p_display_name: input.displayName,
    p_legal_name: input.legalName ?? undefined,
    p_description: input.description ?? undefined,
    p_support_email: input.supportEmail ?? undefined,
    p_support_phone: input.supportPhone ?? undefined,
    p_website_url: input.websiteUrl ?? undefined,
  });

  if (error) {
    return { ok: false, error: merchantSetupErrorMessage(error) };
  }

  const record = asRecord(data);
  const id = record ? readString(record, "merchant_account_id") : null;
  if (!id) {
    return { ok: false, error: "Business profile could not be saved." };
  }

  return { ok: true, data: { merchantAccountId: id } };
}

export type CreateLocationResult = RpcResult<{
  locationId: string;
  publicCode: string | null;
}>;

export async function createMerchantLocation(
  supabase: TypedClient,
  merchantAccountId: string,
  input: NormalizedLocation,
): Promise<CreateLocationResult> {
  const { data, error } = await supabase.rpc("create_merchant_location", {
    p_merchant_account_id: merchantAccountId,
    p_label: input.label,
    p_address_text: input.addressText ?? undefined,
    p_address_line1: input.addressLine1 ?? undefined,
    p_address_line2: input.addressLine2 ?? undefined,
    p_city: input.city ?? undefined,
    p_region: input.region ?? undefined,
    p_postal_code: input.postalCode ?? undefined,
    p_country: input.country,
    p_latitude: input.latitude ?? undefined,
    p_longitude: input.longitude ?? undefined,
    p_timezone: input.timezone ?? undefined,
  });

  if (error) {
    return { ok: false, error: merchantSetupErrorMessage(error) };
  }

  const record = asRecord(data);
  const locationId = record ? readString(record, "location_id") : null;
  if (!locationId) {
    return { ok: false, error: "Location could not be created." };
  }

  return {
    ok: true,
    data: {
      locationId,
      publicCode: record ? readString(record, "public_code") : null,
    },
  };
}

export type UpdateLocationResult = RpcResult<{ locationId: string }>;

export async function updateMerchantLocation(
  supabase: TypedClient,
  locationId: string,
  input: NormalizedLocation,
): Promise<UpdateLocationResult> {
  const { data, error } = await supabase.rpc("update_merchant_location", {
    p_location_id: locationId,
    p_label: input.label,
    p_status: input.status,
    p_address_text: input.addressText ?? undefined,
    p_address_line1: input.addressLine1 ?? undefined,
    p_address_line2: input.addressLine2 ?? undefined,
    p_city: input.city ?? undefined,
    p_region: input.region ?? undefined,
    p_postal_code: input.postalCode ?? undefined,
    p_country: input.country,
    p_latitude: input.latitude ?? undefined,
    p_longitude: input.longitude ?? undefined,
    p_timezone: input.timezone ?? undefined,
  });

  if (error) {
    return { ok: false, error: merchantSetupErrorMessage(error) };
  }

  const record = asRecord(data);
  const id = record ? readString(record, "location_id") : null;
  if (!id) {
    return { ok: false, error: "Location could not be saved." };
  }

  return { ok: true, data: { locationId: id } };
}

export type EnsureHubResult = RpcResult<{
  paymentHubId: string;
  publicCode: string;
  idempotent: boolean;
}>;

export async function ensureLocationPaymentHub(
  supabase: TypedClient,
  locationId: string,
): Promise<EnsureHubResult> {
  const { data, error } = await supabase.rpc("ensure_location_payment_hub", {
    p_location_id: locationId,
  });

  if (error) {
    return { ok: false, error: merchantSetupErrorMessage(error) };
  }

  const record = asRecord(data);
  const paymentHubId = record ? readString(record, "payment_hub_id") : null;
  const publicCode = record ? readString(record, "public_code") : null;
  if (!paymentHubId || !publicCode) {
    return { ok: false, error: "Payment QR code could not be created." };
  }

  return {
    ok: true,
    data: {
      paymentHubId,
      publicCode,
      idempotent: record?.idempotent === true,
    },
  };
}

export type ResolvedPaymentHub = {
  paymentHubId: string;
  publicCode: string;
  merchantAccountId: string;
  merchantDisplayName: string;
  merchantLocationId: string | null;
  locationLabel: string | null;
  currency: string;
};

export async function resolvePaymentHub(
  supabase: TypedClient,
  publicCode: string,
): Promise<ResolvedPaymentHub | null> {
  const code = publicCode.trim();
  if (!code) return null;

  const { data, error } = await supabase.rpc("resolve_payment_hub", {
    p_public_code: code,
  });

  if (error || !data) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  const record = row as {
    payment_hub_id?: string | null;
    public_code?: string | null;
    merchant_account_id?: string | null;
    merchant_display_name?: string | null;
    merchant_location_id?: string | null;
    location_label?: string | null;
    currency?: string | null;
  };

  if (
    !record.payment_hub_id ||
    !record.public_code ||
    !record.merchant_account_id ||
    !record.merchant_display_name
  ) {
    return null;
  }

  return {
    paymentHubId: record.payment_hub_id,
    publicCode: record.public_code,
    merchantAccountId: record.merchant_account_id,
    merchantDisplayName: record.merchant_display_name,
    merchantLocationId: record.merchant_location_id ?? null,
    locationLabel: record.location_label ?? null,
    currency: record.currency ?? "USD",
  };
}
