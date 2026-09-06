"use server";

import { redirect } from "next/navigation";

import { createTypedClient } from "@/lib/supabase/server";
import { createMerchantAccount } from "@/lib/auth/merchant";

export type OnboardingState = { error?: string };

function strOrNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}

/**
 * Server Action: create the caller's merchant account via
 * `create_merchant_account` (the only client-accessible creation path). Runs on
 * the server with the user's cookie session, so the RPC's `auth.uid()` is the
 * authenticated creator.
 *
 * Idempotency: `createMerchantAccount` first checks for an existing active
 * membership and returns it instead of creating a second business, so callback
 * retries, page refreshes, and sequential double-submits all converge on one
 * merchant. A successful create (or an already-member result) redirects to the
 * dashboard, so a resubmit lands on the guarded page and is short-circuited.
 */
export async function createMerchantAction(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createTypedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    return { error: "Business name is required." };
  }

  const result = await createMerchantAccount(supabase, user.id, {
    displayName,
    legalName: strOrNull(formData.get("legalName")),
    supportEmail: strOrNull(formData.get("supportEmail")),
    supportPhone: strOrNull(formData.get("supportPhone")),
    websiteUrl: strOrNull(formData.get("websiteUrl")),
    description: strOrNull(formData.get("description")),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  // Outside any try/catch: redirect() throws NEXT_REDIRECT by design.
  redirect("/business");
}
