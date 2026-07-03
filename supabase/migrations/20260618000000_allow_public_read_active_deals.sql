-- Allow public (anon + authenticated) read access to active deals.
--
-- The mobile `deals` table had RLS enabled with no SELECT policy for the
-- anon role, so the web app's homepage/browse pages saw 0 rows even though
-- the table is populated. This policy exposes only active deals publicly,
-- matching the `is_active = true` filter used by the browse/homepage queries.

alter table public.deals enable row level security;

create policy "Public can read active deals"
on public.deals
for select
to anon, authenticated
using (is_active = true);
