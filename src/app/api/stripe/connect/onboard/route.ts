import { NextRequest } from "next/server";

import {
  authorizeConnectMutation,
  CONNECT_CLIENT_ERRORS,
  connectJson,
  startConnectOnboarding,
} from "@/lib/stripe/connect-onboarding";
import { getStripe, isStripePlatformLive } from "@/lib/stripe/server";
import { getActiveMembership, getMerchantAccount } from "@/lib/auth/merchant";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createTypedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/connect/onboard
 *
 * Starts or continues Express hosted onboarding for the signed-in owner/admin.
 * Returns only an Account Link URL. Never returns a Stripe account id.
 */
export async function POST(request: NextRequest) {
  if (!hasPublicSupabaseEnv()) {
    return connectJson({ error: CONNECT_CLIENT_ERRORS.notConfigured }, 500);
  }

  const supabase = await createTypedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const membership = user
    ? await getActiveMembership(supabase, user.id)
    : null;
  const authz = authorizeConnectMutation(user?.id, membership?.role);
  if (!authz.ok) {
    return connectJson({ error: authz.error }, authz.status);
  }

  const merchant = await getMerchantAccount(
    supabase,
    membership!.merchantAccountId,
  );
  if (!merchant) {
    return connectJson({ error: CONNECT_CLIENT_ERRORS.forbidden }, 403);
  }

  let platformLive: boolean;
  try {
    platformLive = isStripePlatformLive();
  } catch {
    return connectJson({ error: CONNECT_CLIENT_ERRORS.notConfigured }, 500);
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return connectJson({ error: CONNECT_CLIENT_ERRORS.notConfigured }, 500);
  }

  const result = await startConnectOnboarding({
    stripe,
    admin: createAdminClient(),
    merchant: {
      id: merchant.id,
      display_name: merchant.display_name,
      support_email: merchant.support_email,
      website_url: merchant.website_url,
    },
    userEmail: user?.email ?? null,
    platformLive,
    origin: request.nextUrl.origin,
  });

  if (!result.ok) {
    return connectJson({ error: result.error }, result.status);
  }

  return connectJson({ url: result.value.url });
}
