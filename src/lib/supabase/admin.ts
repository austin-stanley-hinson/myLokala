import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client backed by the SERVICE ROLE key.
 *
 * This client BYPASSES Row Level Security. It exists so trusted server code can
 * perform lookups that anon/authenticated callers are (intentionally) not
 * allowed to do — e.g. resolving a public QR `public_code` to its business
 * owner and that owner's Stripe connected account, where the underlying tables
 * have no anon SELECT policy by design.
 *
 * NEVER import this module into a Client Component or any code that ships to the
 * browser. The service-role key must stay on the server. Guardrails:
 *   - The key is read from SUPABASE_SERVICE_ROLE_KEY (NOT prefixed NEXT_PUBLIC_),
 *     so Next.js never inlines it into the client bundle.
 *   - A runtime check throws if this ever executes in a browser context.
 *
 * The client is created lazily (and memoized) so importing this module never
 * throws at build time; the missing-key error only surfaces when it is used.
 */
let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "The Supabase service-role client must never be used in the browser.",
    );
  }

  if (adminClient) {
    return adminClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Add it to the environment before using Supabase.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your environment (server-side only) before using the admin client.",
    );
  }

  // No session persistence or token refresh: this is a stateless server client,
  // not tied to a user's cookies.
  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}
