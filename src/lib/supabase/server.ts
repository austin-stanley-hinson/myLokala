import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; middleware will refresh the session.
          }
        },
      },
    },
  );
}

/**
 * Cookie-bound server client typed against the generated `Database` schema.
 *
 * Use this in the Auth/merchant-authorization code paths so table and RPC
 * access (`merchant_members`, `merchant_accounts`, `create_merchant_account`,
 * …) is fully type-checked. Legacy modules that still reference not-yet-migrated
 * tables continue to use the untyped `createClient` above.
 */
export async function createTypedClient(): Promise<SupabaseClient<Database>> {
  return (await createClient()) as SupabaseClient<Database>;
}
