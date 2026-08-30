import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components ("use client").
 * Do not import this from Server Components — use `@/lib/supabase/server` instead.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createBrowserClient(url, anonKey);
}

/**
 * Browser client typed against the generated `Database` schema, for the
 * Auth/merchant-authorization client components (login, signup, header, …).
 */
export function createTypedClient(): SupabaseClient<Database> {
  return createClient() as SupabaseClient<Database>;
}
