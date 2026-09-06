/**
 * Browser-safe Supabase project URL + anon/publishable key.
 *
 * The dashboard currently copies `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
 * this app historically used `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Either works.
 * Both names must appear as static `process.env.NEXT_PUBLIC_*` reads so Next
 * can inline them into the client bundle.
 */
export function getPublicSupabaseUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url || undefined;
}

export function getPublicSupabaseAnonKey(): string | undefined {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return key || undefined;
}

export function hasPublicSupabaseEnv(): boolean {
  return Boolean(getPublicSupabaseUrl() && getPublicSupabaseAnonKey());
}
