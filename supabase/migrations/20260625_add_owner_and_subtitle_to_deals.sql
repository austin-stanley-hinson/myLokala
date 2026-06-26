-- Business ownership for deals so merchants can manage only their own listings
-- from the web dashboard, plus a short `subtitle` shown on deal cards. Both
-- columns are additive and nullable, so the mobile app's existing rows stay
-- valid without a backfill.

alter table public.deals
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists subtitle text;

create index if not exists deals_owner_id_idx on public.deals (owner_id);

alter table public.deals enable row level security;

-- Public read access for active deals is provided by the prior migration
-- ("Public can read active deals") and is intentionally left untouched so the
-- marketplace keeps showing active deals to everyone.

-- Business owners can read all of their own deals, including inactive ones.
drop policy if exists "Owners can read own deals" on public.deals;
create policy "Owners can read own deals"
on public.deals
for select
to authenticated
using (auth.uid() = owner_id);

-- Business owners can create deals they own.
drop policy if exists "Owners can insert own deals" on public.deals;
create policy "Owners can insert own deals"
on public.deals
for insert
to authenticated
with check (auth.uid() = owner_id);

-- Business owners can update (e.g. activate/deactivate) their own deals.
drop policy if exists "Owners can update own deals" on public.deals;
create policy "Owners can update own deals"
on public.deals
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- Business owners can remove their own deals.
drop policy if exists "Owners can delete own deals" on public.deals;
create policy "Owners can delete own deals"
on public.deals
for delete
to authenticated
using (auth.uid() = owner_id);
