import {
  authorizeConnectMutation,
  CONNECT_CLIENT_ERRORS,
  connectJson,
  createExpressLoginLink,
} from "@/lib/stripe/connect-onboarding";
import { getStripe, isStripePlatformLive } from "@/lib/stripe/server";
import { getActiveMembership } from "@/lib/auth/merchant";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createTypedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/connect/login-link
 *
 * Owner/admin Express Dashboard login link. Returns a URL only.
 */
export async function POST() {
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

  const result = await createExpressLoginLink({
    stripe,
    admin: createAdminClient(),
    merchantAccountId: membership!.merchantAccountId,
    platformLive,
  });

  if (!result.ok) {
    return connectJson(
      result.code
        ? { error: result.error, code: result.code }
        : { error: result.error },
      result.status,
    );
  }

  return connectJson({ url: result.value.url });
}
