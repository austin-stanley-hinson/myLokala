"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBusinessContext } from "@/lib/auth/business-context";
import { canManageMerchant } from "@/lib/auth/merchant";
import { createTypedClient } from "@/lib/supabase/server";
import {
  createMerchantLocation,
  ensureLocationPaymentHub,
  getMerchantLocation,
  updateMerchantLocation,
} from "@/lib/merchant/setup";
import {
  validateMerchantLocation,
  type FieldErrors,
} from "@/lib/merchant/validation";

export type LocationActionState = {
  error?: string;
  errors?: FieldErrors;
  success?: string;
};

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readLocationInput(formData: FormData) {
  return {
    label: str(formData, "label"),
    addressText: str(formData, "addressText"),
    addressLine1: str(formData, "addressLine1"),
    addressLine2: str(formData, "addressLine2"),
    city: str(formData, "city"),
    region: str(formData, "region"),
    postalCode: str(formData, "postalCode"),
    country: str(formData, "country") || "US",
    latitude: str(formData, "latitude"),
    longitude: str(formData, "longitude"),
    timezone: str(formData, "timezone"),
    status: str(formData, "status") || "active",
  };
}

export async function createLocationAction(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const { merchant, role } = await getBusinessContext();

  if (!canManageMerchant(role)) {
    return { error: "You don't have permission to change this." };
  }

  const parsed = validateMerchantLocation(readLocationInput(formData));
  if (!parsed.ok) {
    return { error: parsed.message, errors: parsed.errors };
  }

  const supabase = await createTypedClient();
  const result = await createMerchantLocation(
    supabase,
    merchant.id,
    parsed.value,
  );

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/business");
  revalidatePath("/business/locations");
  redirect(`/business/locations/${result.data.locationId}`);
}

export async function updateLocationAction(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const { merchant, role } = await getBusinessContext();

  if (!canManageMerchant(role)) {
    return { error: "You don't have permission to change this." };
  }

  const locationId = str(formData, "locationId");
  if (!locationId) {
    return { error: "Location not found." };
  }

  const supabase = await createTypedClient();
  const existing = await getMerchantLocation(supabase, locationId);
  if (!existing || existing.merchant_account_id !== merchant.id) {
    return { error: "Location not found." };
  }

  const parsed = validateMerchantLocation(readLocationInput(formData));
  if (!parsed.ok) {
    return { error: parsed.message, errors: parsed.errors };
  }

  const result = await updateMerchantLocation(
    supabase,
    locationId,
    parsed.value,
  );

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/business/locations");
  revalidatePath(`/business/locations/${locationId}`);
  return { success: "Location saved." };
}

export async function ensureLocationHubAction(
  locationId: string,
): Promise<LocationActionState> {
  const { merchant, role } = await getBusinessContext();

  if (!canManageMerchant(role)) {
    return { error: "You don't have permission to change this." };
  }

  const supabase = await createTypedClient();
  const existing = await getMerchantLocation(supabase, locationId);
  if (!existing || existing.merchant_account_id !== merchant.id) {
    return { error: "Location not found." };
  }

  const result = await ensureLocationPaymentHub(supabase, locationId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/business/locations/${locationId}`);
  return { success: "Payment QR code is ready." };
}
