import { createAdminClient } from "@/lib/supabase/admin";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the caller's Supabase user id for an API route, server-side only.
 *
 * Two transports are supported because two very different clients call these
 * routes:
 *   * The mobile app has no cookies, so it sends `Authorization: Bearer <access
 *     token>`. The token is verified WITH Supabase (never decoded locally), so
 *     a forged or expired JWT resolves to null.
 *   * The web app uses session cookies via the @supabase/ssr server client.
 *
 * Returns null when the caller is anonymous. Callers must never accept a user
 * id from the request body -- that would let anyone impersonate any customer.
 */
export async function resolveApiUserId(req: Request): Promise<string | null> {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;

  if (bearer) {
    try {
      const { data, error } = await createAdminClient().auth.getUser(bearer);
      if (!error && data.user) {
        return data.user.id;
      }
    } catch {
      // Fall through: a bad token is treated as anonymous, not as an error.
    }
    return null;
  }

  if (!hasPublicSupabaseEnv()) {
    return null;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
