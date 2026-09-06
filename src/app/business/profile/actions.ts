"use server";

import { revalidatePath } from "next/cache";

import { getBusinessContext } from "@/lib/auth/business-context";
import { canManageMerchant } from "@/lib/auth/merchant";
import { createTypedClient } from "@/lib/supabase/server";
import { updateMerchantProfile } from "@/lib/merchant/setup";
import {
  validateMerchantProfile,
  type FieldErrors,
} from "@/lib/merchant/validation";

export type ProfileActionState = {
  error?: string;
  errors?: FieldErrors;
  success?: string;
};

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function updateMerchantProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const { merchant, role } = await getBusinessContext();

  if (!canManageMerchant(role)) {
    return { error: "You don't have permission to change this." };
  }

  const parsed = validateMerchantProfile({
    displayName: str(formData, "displayName"),
    legalName: str(formData, "legalName"),
    description: str(formData, "description"),
    supportEmail: str(formData, "supportEmail"),
    supportPhone: str(formData, "supportPhone"),
    websiteUrl: str(formData, "websiteUrl"),
  });

  if (!parsed.ok) {
    return { error: parsed.message, errors: parsed.errors };
  }

  const supabase = await createTypedClient();
  const result = await updateMerchantProfile(
    supabase,
    merchant.id,
    parsed.value,
  );

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/business");
  revalidatePath("/business/profile");
  return { success: "Business profile saved." };
}
