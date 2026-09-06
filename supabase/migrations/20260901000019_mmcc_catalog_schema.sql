-- MMCC legacy deals catalog (browsable MVP catalog). Independent domain from
-- merchant_accounts / wallets / ledger / redemptions — no FK into that domain
-- except the deliberately-nullable future claim column on catalog_businesses.
--
-- Source: immutable export at
-- "Desktop/Lokala Legacy Export 2026-08-29/deals_raw.{csv,json}" (95 active
-- rows from the legacy `deals` table, project ifvnofdnjvmsfsxhixip). This
-- migration only creates the schema; import is a separate idempotent script.

-- ---------------------------------------------------------------------------
-- catalog_businesses: one row per distinct legacy business_name within a
-- source. Grouping key is the exact (case-sensitive) business_name string —
-- verified against the 2026-08-29 export: 95 deal rows resolve to exactly 94
-- distinct business_name values with no near-duplicate casing/whitespace
-- variants, so exact-string grouping is sufficient for this dataset. A
-- different legacy business genuinely sharing an identical name string would
-- incorrectly merge under this scheme; none exist in the current export.
-- ---------------------------------------------------------------------------
create table public.catalog_businesses (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'mmcc_legacy_export'
    check (char_length(trim(source)) > 0),
  business_name text not null check (char_length(trim(business_name)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  -- Future claim/mapping to a real merchant_accounts row. Never populated by
  -- the import script; nullable until a reviewed claim flow links it later.
  merchant_account_id uuid references public.merchant_accounts (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source, business_name)
);

create trigger catalog_businesses_set_updated_at
  before update on public.catalog_businesses
  for each row execute function public.set_updated_at();

comment on table public.catalog_businesses is
  'Browsable legacy catalog businesses. Independent from merchant_accounts by design for MVP; merchant_account_id is a future, admin-reviewed claim link, never auto-populated.';

-- ---------------------------------------------------------------------------
-- catalog_locations: address/geo for a catalog business. Modeled as its own
-- table (rather than columns on catalog_businesses) even though the current
-- export is 1 location per business, so a business with multiple physical
-- locations is representable without a schema change later.
-- ---------------------------------------------------------------------------
create table public.catalog_locations (
  id uuid primary key default gen_random_uuid(),
  catalog_business_id uuid not null references public.catalog_businesses (id) on delete cascade,
  address text not null check (char_length(trim(address)) > 0),
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  phone text,
  website text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (catalog_business_id, address)
);

create index catalog_locations_business_idx on public.catalog_locations (catalog_business_id);

create trigger catalog_locations_set_updated_at
  before update on public.catalog_locations
  for each row execute function public.set_updated_at();

comment on table public.catalog_locations is
  'Address/geo for a catalog business. One business can have multiple locations.';

-- ---------------------------------------------------------------------------
-- catalog_deals: one row per legacy deal row. legacy_deal_id is the
-- idempotent import key and migration-traceability column (per the export
-- README: old IDs are not reused as product primary keys — id gets a fresh
-- uuid). Silver Street Tavern is the known case of two distinct
-- legacy_deal_id rows sharing one catalog_location: that is expected and
-- must not collapse to one deal row.
-- ---------------------------------------------------------------------------
create table public.catalog_deals (
  id uuid primary key default gen_random_uuid(),
  legacy_deal_id uuid not null unique,
  catalog_location_id uuid not null references public.catalog_locations (id) on delete cascade,
  source text not null default 'mmcc_legacy_export'
    check (char_length(trim(source)) > 0),
  title text not null check (char_length(trim(title)) > 0),
  subtitle text,
  discount_detail text not null check (char_length(trim(discount_detail)) > 0),
  offer_type text not null check (offer_type in ('percentage', 'flat')),
  percent_off integer check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  category text not null check (char_length(trim(category)) > 0),
  -- Free-text availability/expiry, matching the legacy mobile `deals` shape
  -- (values like "Ongoing", "Every Monday", not real timestamps).
  expires_at text,
  -- Preserved verbatim from the legacy export. Not recomputed or interpreted
  -- (its original meaning, e.g. distance from an export-time reference
  -- point, is not reconstructable) — kept solely for source fidelity.
  distance_meters integer check (distance_meters is null or distance_meters >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  legacy_created_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (offer_type = 'percentage' and percent_off is not null)
    or (offer_type = 'flat' and percent_off is null)
  )
);

create index catalog_deals_location_idx on public.catalog_deals (catalog_location_id);
create index catalog_deals_category_idx on public.catalog_deals (category);
create index catalog_deals_status_idx on public.catalog_deals (status);

create trigger catalog_deals_set_updated_at
  before update on public.catalog_deals
  for each row execute function public.set_updated_at();

comment on table public.catalog_deals is
  'Browsable legacy catalog deals (MVP: read-only for customers, no merchant create/edit/claim). legacy_deal_id is unique and is the idempotent import key.';

-- ---------------------------------------------------------------------------
-- saved_catalog_deals: user bookmarks. User-scoped, no anon access.
-- ---------------------------------------------------------------------------
create table public.saved_catalog_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  catalog_deal_id uuid not null references public.catalog_deals (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, catalog_deal_id)
);

create index saved_catalog_deals_user_idx on public.saved_catalog_deals (user_id);

comment on table public.saved_catalog_deals is
  'Customer-saved catalog deals. unique(user_id, catalog_deal_id) prevents duplicate saves of the same deal.';

-- ---------------------------------------------------------------------------
-- catalog_deal_redemptions: user-scoped redemption log, denormalized
-- snapshot columns mirror the legacy `redemptions` table pattern
-- (docs/mobile-db-schema.md). Duplicate-redemption prevention is scoped to
-- "same user, same deal, same calendar day" rather than a lifetime unique
-- constraint, since several deals are legitimately recurring (e.g.
-- "Every Monday") and are meant to be redeemed again on a later date.
-- ---------------------------------------------------------------------------
create table public.catalog_deal_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  catalog_deal_id uuid not null references public.catalog_deals (id) on delete restrict,
  redeemed_at timestamptz not null default timezone('utc', now()),
  redeemed_date date not null generated always as ((redeemed_at at time zone 'utc')::date) stored,
  business_name_snapshot text not null,
  deal_title_snapshot text not null,
  discount_detail_snapshot text not null,
  category_snapshot text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, catalog_deal_id, redeemed_date)
);

create index catalog_deal_redemptions_user_idx
  on public.catalog_deal_redemptions (user_id, redeemed_at desc);
create index catalog_deal_redemptions_deal_idx
  on public.catalog_deal_redemptions (catalog_deal_id);

comment on table public.catalog_deal_redemptions is
  'Customer redemption log for catalog deals. unique(user_id, catalog_deal_id, redeemed_date) prevents duplicate same-day redemption while still allowing legitimate recurring re-redemption on a later day.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.catalog_businesses enable row level security;
alter table public.catalog_locations enable row level security;
alter table public.catalog_deals enable row level security;
alter table public.saved_catalog_deals enable row level security;
alter table public.catalog_deal_redemptions enable row level security;

-- Public catalog: anon + authenticated read active rows. No client
-- insert/update/delete policies anywhere in this block — writes are
-- service_role only (import script), matching the MVP requirement that
-- merchants do not create/edit/claim these deals.
create policy catalog_businesses_select_active
  on public.catalog_businesses for select to anon, authenticated
  using (status = 'active');

create policy catalog_locations_select_active_business
  on public.catalog_locations for select to anon, authenticated
  using (
    exists (
      select 1 from public.catalog_businesses b
      where b.id = catalog_locations.catalog_business_id
        and b.status = 'active'
    )
  );

create policy catalog_deals_select_active
  on public.catalog_deals for select to anon, authenticated
  using (status = 'active');

-- Saved/redeemed: user-scoped, authenticated only (no anon policy at all).
create policy saved_catalog_deals_select_own
  on public.saved_catalog_deals for select to authenticated
  using (user_id = auth.uid());

create policy saved_catalog_deals_insert_own
  on public.saved_catalog_deals for insert to authenticated
  with check (user_id = auth.uid());

create policy saved_catalog_deals_delete_own
  on public.saved_catalog_deals for delete to authenticated
  using (user_id = auth.uid());

create policy catalog_deal_redemptions_select_own
  on public.catalog_deal_redemptions for select to authenticated
  using (user_id = auth.uid());

create policy catalog_deal_redemptions_insert_own
  on public.catalog_deal_redemptions for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.catalog_businesses to anon, authenticated;
grant select on public.catalog_locations to anon, authenticated;
grant select on public.catalog_deals to anon, authenticated;
grant select, insert, delete on public.saved_catalog_deals to authenticated;
grant select, insert on public.catalog_deal_redemptions to authenticated;

grant all on public.catalog_businesses to service_role;
grant all on public.catalog_locations to service_role;
grant all on public.catalog_deals to service_role;
grant all on public.saved_catalog_deals to service_role;
grant all on public.catalog_deal_redemptions to service_role;
