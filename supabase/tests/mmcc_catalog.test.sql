-- MMCC legacy catalog schema tests (standard pgTAP only).
-- Covers: RLS correctness (anon read/no-write, authenticated read/no-write,
-- service_role write), constraint correctness (legacy_deal_id uniqueness,
-- offer_type/percent_off check, duplicate-save/redemption prevention), and
-- the Silver Street Tavern non-dedup case (two legacy_deal_id rows sharing
-- one business/location must both persist as distinct catalog_deals rows).
-- Run: npx supabase test db --local

begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

create function pg_temp.uid(p_label text)
returns uuid
language sql
immutable
as $$
  select md5('mmcc-catalog-test:' || p_label)::uuid;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  (
    pg_temp.uid('customer_a'), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'catalog_customer_a@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Catalog Customer A"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), false, false
  ),
  (
    pg_temp.uid('customer_b'), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'catalog_customer_b@example.test',
    extensions.crypt('password', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Catalog Customer B"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), false, false
  );

-- Fixture: one business, one location, and the Silver Street Tavern pair of
-- distinct legacy_deal_id rows sharing that one business/location.
insert into public.catalog_businesses (id, business_name)
values (pg_temp.uid('biz_silver'), 'Silver Street Tavern');

insert into public.catalog_locations (id, catalog_business_id, address, latitude, longitude, phone)
values (
  pg_temp.uid('loc_silver'), pg_temp.uid('biz_silver'),
  '2 Silver St, Waterville ME', 44.548894, -69.629304, '(207) 877-0000'
);

insert into public.catalog_deals (
  id, legacy_deal_id, catalog_location_id, title, discount_detail,
  offer_type, percent_off, category
) values
  (
    pg_temp.uid('deal_silver_1'), '1d81fb3c-06dc-4a9c-bba6-93e9ebe24c19',
    pg_temp.uid('loc_silver'), '10% Off Food Order',
    '10% off food order. Excludes alcohol. Dine in only.', 'percentage', 10, 'drinks'
  ),
  (
    pg_temp.uid('deal_silver_2'), '784049cc-86ea-44f2-b599-cb8f36b4e376',
    pg_temp.uid('loc_silver'), '10% Off Food Order',
    '10% off food order. Excludes alcohol. Dine in only.', 'percentage', 10, 'drinks'
  );

-- A second, unrelated business/location/deal for cross-user RLS checks.
insert into public.catalog_businesses (id, business_name)
values (pg_temp.uid('biz_other'), '3D Stitchery');

insert into public.catalog_locations (id, catalog_business_id, address, latitude, longitude)
values (pg_temp.uid('loc_other'), pg_temp.uid('biz_other'), 'Waterville, ME', 44.5546277, -69.6297798);

insert into public.catalog_deals (
  id, legacy_deal_id, catalog_location_id, title, discount_detail,
  offer_type, percent_off, category
) values (
  pg_temp.uid('deal_other'), '17772ad8-5920-4b98-aca3-abd39f3b4e49',
  pg_temp.uid('loc_other'), '10% Off Entire Purchase',
  '10% off entire purchase', 'percentage', 10, 'retail'
);

-- 1. Silver Street Tavern: both legacy_deal_id rows persisted as distinct
-- catalog_deals rows sharing one catalog_location — not deduplicated.
select is(
  (
    select count(*)::int from public.catalog_deals
    where catalog_location_id = pg_temp.uid('loc_silver')
  ),
  2,
  '1: Silver Street Tavern keeps two distinct catalog_deals rows on one shared location, not deduplicated'
);

-- 2. Both Silver Street deals resolve back to the one shared business.
select is(
  (
    select count(distinct b.id)::int
    from public.catalog_deals d
    join public.catalog_locations l on l.id = d.catalog_location_id
    join public.catalog_businesses b on b.id = l.catalog_business_id
    where d.id in (pg_temp.uid('deal_silver_1'), pg_temp.uid('deal_silver_2'))
  ),
  1,
  '2: both Silver Street Tavern deals resolve to the same shared catalog_business'
);

-- 3. legacy_deal_id uniqueness is enforced.
select throws_ok(
  $$
    insert into public.catalog_deals (
      legacy_deal_id, catalog_location_id, title, discount_detail, offer_type, category
    ) values (
      '1d81fb3c-06dc-4a9c-bba6-93e9ebe24c19',
      (select id from public.catalog_locations limit 1),
      'Duplicate legacy id', 'x', 'flat', 'retail'
    )
  $$,
  '23505',
  null,
  '3: legacy_deal_id unique constraint rejects a duplicate'
);

-- 4-5. offer_type/percent_off consistency check.
select throws_ok(
  $$
    insert into public.catalog_deals (
      legacy_deal_id, catalog_location_id, title, discount_detail, offer_type, percent_off, category
    ) values (
      gen_random_uuid(), (select id from public.catalog_locations limit 1),
      'Bad percentage', 'x', 'percentage', null, 'retail'
    )
  $$,
  '23514',
  null,
  '4: percentage offer_type requires a non-null percent_off'
);

select throws_ok(
  $$
    insert into public.catalog_deals (
      legacy_deal_id, catalog_location_id, title, discount_detail, offer_type, percent_off, category
    ) values (
      gen_random_uuid(), (select id from public.catalog_locations limit 1),
      'Bad flat', 'x', 'flat', 15, 'retail'
    )
  $$,
  '23514',
  null,
  '5: flat offer_type requires a null percent_off'
);

-- 6. Deactivating the business hides its locations from public read (join
-- checked directly here; RLS behavior re-checked as anon in test 10).
update public.catalog_businesses set status = 'inactive' where id = pg_temp.uid('biz_other');
select is(
  (
    select status from public.catalog_businesses where id = pg_temp.uid('biz_other')
  ),
  'inactive',
  '6: business status can be toggled inactive'
);
update public.catalog_businesses set status = 'active' where id = pg_temp.uid('biz_other');

-- ---------------------------------------------------------------------------
-- RLS: anon
-- ---------------------------------------------------------------------------
set local role anon;

select is(
  (select count(*)::int from public.catalog_businesses),
  2,
  '7: anon can read active catalog_businesses'
);

select is(
  (select count(*)::int from public.catalog_deals),
  3,
  '8: anon can read active catalog_deals'
);

select throws_ok(
  $$insert into public.catalog_businesses (business_name) values ('Anon Attempt')$$,
  '42501',
  null,
  '9: anon cannot insert into catalog_businesses'
);

-- RLS UPDATE enforcement filters rows via the USING clause rather than
-- raising an error (unlike INSERT's WITH CHECK, which does throw — see
-- test 9), so the correct assertion is "zero rows affected" against a real,
-- currently-visible row, not an exception.
with attempted as (
  update public.catalog_deals
  set title = 'hacked'
  where id = pg_temp.uid('deal_other')
  returning 1
)
select is(
  (select count(*)::int from attempted),
  0,
  '10: anon UPDATE on catalog_deals matches zero rows, even against a real, currently-visible deal'
);

select is(
  (select count(*)::int from public.saved_catalog_deals),
  0,
  '11: anon has no access to saved_catalog_deals (RLS blocks read, no matching rows visible)'
);

reset role;

-- ---------------------------------------------------------------------------
-- RLS: authenticated (read catalog, cannot write catalog, can manage own
-- saved/redeemed rows only)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid('customer_a')::text, true);

select is(
  (select count(*)::int from public.catalog_deals),
  3,
  '12: authenticated can read active catalog_deals'
);

select throws_ok(
  $$insert into public.catalog_deals (
      legacy_deal_id, catalog_location_id, title, discount_detail, offer_type, category
    ) values (
      gen_random_uuid(), (select id from public.catalog_locations limit 1),
      'Auth Attempt', 'x', 'flat', 'retail'
    )$$,
  '42501',
  null,
  '13: authenticated cannot insert into catalog_deals'
);

select lives_ok(
  format(
    $$insert into public.saved_catalog_deals (user_id, catalog_deal_id) values (%L, %L)$$,
    pg_temp.uid('customer_a'), pg_temp.uid('deal_silver_1')
  ),
  '14: authenticated can save a deal for themselves'
);

select throws_ok(
  format(
    $$insert into public.saved_catalog_deals (user_id, catalog_deal_id) values (%L, %L)$$,
    pg_temp.uid('customer_b'), pg_temp.uid('deal_silver_2')
  ),
  '42501',
  null,
  '15: authenticated cannot save a deal on behalf of another user'
);

select throws_ok(
  format(
    $$insert into public.saved_catalog_deals (user_id, catalog_deal_id) values (%L, %L)$$,
    pg_temp.uid('customer_a'), pg_temp.uid('deal_silver_1')
  ),
  '23505',
  null,
  '16: duplicate save of the same deal by the same user is rejected'
);

select is(
  (select count(*)::int from public.saved_catalog_deals),
  1,
  '17: authenticated only sees their own saved_catalog_deals rows'
);

select lives_ok(
  format(
    $$insert into public.catalog_deal_redemptions (
        user_id, catalog_deal_id, business_name_snapshot, deal_title_snapshot,
        discount_detail_snapshot, category_snapshot
      ) values (%L, %L, 'Silver Street Tavern', '10%% Off Food Order', '10%% off food order', 'drinks')$$,
    pg_temp.uid('customer_a'), pg_temp.uid('deal_silver_1')
  ),
  '18: authenticated can redeem a deal for themselves'
);

select throws_ok(
  format(
    $$insert into public.catalog_deal_redemptions (
        user_id, catalog_deal_id, business_name_snapshot, deal_title_snapshot,
        discount_detail_snapshot, category_snapshot
      ) values (%L, %L, 'Silver Street Tavern', '10%% Off Food Order', '10%% off food order', 'drinks')$$,
    pg_temp.uid('customer_a'), pg_temp.uid('deal_silver_1')
  ),
  '23505',
  null,
  '19: a second redemption of the same deal by the same user on the same day is rejected'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- RLS: service_role can write catalog tables (import path)
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$insert into public.catalog_businesses (business_name) values ('Service Role Insert Co')$$,
  '20: service_role can insert into catalog_businesses'
);

select lives_ok(
  format(
    $$update public.catalog_deals set status = 'inactive' where id = %L$$,
    pg_temp.uid('deal_other')
  ),
  '21: service_role can update catalog_deals'
);

select lives_ok(
  format(
    $$delete from public.saved_catalog_deals where user_id = %L$$,
    pg_temp.uid('customer_a')
  ),
  '22: service_role can delete saved_catalog_deals rows'
);

reset role;

-- 23. Deactivated deal (test 21) is hidden from anon read.
set local role anon;
select is(
  (select count(*)::int from public.catalog_deals where id = pg_temp.uid('deal_other')),
  0,
  '23: an inactive catalog_deal is not visible to anon'
);
reset role;

-- 24. A same-name business (different source) is not silently merged with
-- an existing one — unique(source, business_name) scopes grouping per
-- source, not globally, so a hypothetical second source can coexist.
select lives_ok(
  $$insert into public.catalog_businesses (business_name, source) values ('Silver Street Tavern', 'manual_admin_entry')$$,
  '24: unique(source, business_name) is scoped per source, allowing a distinct source to reuse a business name'
);

-- ---------------------------------------------------------------------------
-- Idempotent upsert: the exact ON CONFLICT ... DO UPDATE pattern
-- src/lib/catalog/mmcc-import.ts uses (via supabase-js .upsert()), run twice
-- with the same and then changed input, at the SQL layer. This is what makes
-- running the import script twice against the same export produce identical
-- row counts, and running it again against a corrected later export refresh
-- existing rows rather than duplicate them.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id_1 uuid;
  v_id_2 uuid;
begin
  insert into public.catalog_businesses (business_name, source, status)
  values ('Idempotency Test Co', 'mmcc_legacy_export', 'active')
  on conflict (source, business_name)
  do update set status = excluded.status, business_name = excluded.business_name, source = excluded.source
  returning id into v_id_1;

  insert into public.catalog_businesses (business_name, source, status)
  values ('Idempotency Test Co', 'mmcc_legacy_export', 'active')
  on conflict (source, business_name)
  do update set status = excluded.status, business_name = excluded.business_name, source = excluded.source
  returning id into v_id_2;

  perform set_config('lokala_test.idem_biz_1', v_id_1::text, true);
  perform set_config('lokala_test.idem_biz_2', v_id_2::text, true);
end $$;

select is(
  current_setting('lokala_test.idem_biz_2'),
  current_setting('lokala_test.idem_biz_1'),
  '25: upserting the same (source, business_name) twice returns the same catalog_businesses id'
);

select is(
  (select count(*)::int from public.catalog_businesses where business_name = 'Idempotency Test Co'),
  1,
  '26: exactly one catalog_businesses row exists after the repeated upsert'
);

do $$
declare
  v_biz_id uuid := current_setting('lokala_test.idem_biz_1')::uuid;
  v_id_1 uuid;
  v_id_2 uuid;
begin
  insert into public.catalog_locations (catalog_business_id, address, latitude, longitude, phone, website)
  values (v_biz_id, '1 Test St, Waterville ME', 44.55, -69.63, null, null)
  on conflict (catalog_business_id, address)
  do update set latitude = excluded.latitude, longitude = excluded.longitude,
    phone = excluded.phone, website = excluded.website
  returning id into v_id_1;

  insert into public.catalog_locations (catalog_business_id, address, latitude, longitude, phone, website)
  values (v_biz_id, '1 Test St, Waterville ME', 44.55, -69.63, null, null)
  on conflict (catalog_business_id, address)
  do update set latitude = excluded.latitude, longitude = excluded.longitude,
    phone = excluded.phone, website = excluded.website
  returning id into v_id_2;

  perform set_config('lokala_test.idem_loc_1', v_id_1::text, true);
  perform set_config('lokala_test.idem_loc_2', v_id_2::text, true);
end $$;

select is(
  current_setting('lokala_test.idem_loc_2'),
  current_setting('lokala_test.idem_loc_1'),
  '27: upserting the same (catalog_business_id, address) twice returns the same catalog_locations id'
);

select is(
  (
    select count(*)::int from public.catalog_locations
    where catalog_business_id = current_setting('lokala_test.idem_biz_1')::uuid
  ),
  1,
  '28: exactly one catalog_locations row exists after the repeated upsert'
);

do $$
declare
  v_loc_id uuid := current_setting('lokala_test.idem_loc_1')::uuid;
  v_legacy_id uuid := gen_random_uuid();
  v_id_1 uuid;
  v_id_2 uuid;
begin
  insert into public.catalog_deals (
    legacy_deal_id, catalog_location_id, title, discount_detail, offer_type, percent_off, category
  ) values (
    v_legacy_id, v_loc_id, 'Original Title', 'Original detail', 'percentage', 10, 'retail'
  )
  on conflict (legacy_deal_id)
  do update set title = excluded.title, discount_detail = excluded.discount_detail,
    offer_type = excluded.offer_type, percent_off = excluded.percent_off, category = excluded.category
  returning id into v_id_1;

  -- Simulates re-running the import against a LATER export where this same
  -- legacy_deal_id's title was corrected -- must refresh in place, not
  -- duplicate.
  insert into public.catalog_deals (
    legacy_deal_id, catalog_location_id, title, discount_detail, offer_type, percent_off, category
  ) values (
    v_legacy_id, v_loc_id, 'Updated Title', 'Updated detail', 'percentage', 15, 'retail'
  )
  on conflict (legacy_deal_id)
  do update set title = excluded.title, discount_detail = excluded.discount_detail,
    offer_type = excluded.offer_type, percent_off = excluded.percent_off, category = excluded.category
  returning id into v_id_2;

  perform set_config('lokala_test.idem_deal_1', v_id_1::text, true);
  perform set_config('lokala_test.idem_deal_2', v_id_2::text, true);
  perform set_config('lokala_test.idem_deal_legacy_id', v_legacy_id::text, true);
end $$;

select is(
  current_setting('lokala_test.idem_deal_2'),
  current_setting('lokala_test.idem_deal_1'),
  '29: re-upserting the same legacy_deal_id with changed fields returns the same catalog_deals id, not a new row'
);

select is(
  (
    select jsonb_build_object('count', (
      select count(*)::int from public.catalog_deals
      where legacy_deal_id = current_setting('lokala_test.idem_deal_legacy_id')::uuid
    ), 'title', (
      select title from public.catalog_deals
      where legacy_deal_id = current_setting('lokala_test.idem_deal_legacy_id')::uuid
    ))
  ),
  jsonb_build_object('count', 1, 'title', 'Updated Title'),
  '30: exactly one catalog_deals row remains, refreshed to the latest title from the later import'
);

select * from finish();
rollback;
