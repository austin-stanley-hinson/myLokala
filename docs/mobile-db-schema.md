# Mobile App Supabase Schema (source of truth)

This is the canonical schema the web app must align to. It was reconstructed by
introspecting the live mobile Supabase project (tables exist; columns verified via
PostgREST). **Do not invent tables or columns.** If a column is needed that is not
listed here, raise it as a schema-change proposal rather than assuming it exists.

## `deals`
Replaces the old `coupons` / `restaurants` listings. The homepage and browse pages
fetch active deals from here (`is_active = true`).

| column          | notes                                  |
|-----------------|----------------------------------------|
| id              | primary key (uuid)                     |
| business_name   | name of the business offering the deal |
| title           | deal title / offer headline            |
| discount_detail | human-readable discount description    |
| category        | category label                         |
| is_active       | boolean — only show active deals       |
| expires_at      | timestamp, nullable                    |
| created_at      | timestamp                              |
| address         | text, nullable                         |
| latitude        | numeric, nullable                      |
| longitude       | numeric, nullable                      |
| phone           | text, nullable                         |
| website         | text, nullable                         |
| subtitle        | text, nullable — short tagline shown on deal cards (added for web business dashboard) |
| owner_id        | uuid, nullable — references `auth.users(id)`; set on deals created by a business owner via the web dashboard |

> Note: there is **no** `description`, `image_url`, or `terms` column on `deals`.
>
> `subtitle` and `owner_id` were added by migration
> `20260625_add_owner_and_subtitle_to_deals.sql` to support the web business
> dashboard. Both are additive/nullable so existing mobile rows stay valid.
>
> **RLS:** public (anon + authenticated) read of active deals is preserved.
> Business owners may `select`/`insert`/`update`/`delete` only their own deals
> (`auth.uid() = owner_id`).

## `redemptions`
A row is inserted when a user redeems a deal. Denormalized snapshot columns capture
the deal details at redemption time.

| column          | notes                          |
|-----------------|--------------------------------|
| id              | primary key                    |
| user_id         | auth user id                   |
| deal_id         | references the redeemed deal   |
| business_name   | snapshot                       |
| deal_title      | snapshot                       |
| discount_detail | snapshot                       |
| category        | snapshot                       |
| redeemed_at     | timestamp                      |

## `saved_deals`
Bookmarking / saving deals.

| column     | notes                |
|------------|----------------------|
| id         | primary key          |
| user_id    | auth user id         |
| deal_id    | references the deal   |
| created_at | timestamp            |

## `profiles`
| column           | notes                                                        |
|------------------|--------------------------------------------------------------|
| id               | references auth user                                         |
| full_name        | text                                                         |
| member_id        | membership identifier                                        |
| member_type      | membership tier/type                                         |
| created_at       | timestamp                                                    |
| account_type     | text, not null, default `'customer'`; check in (`'customer'`, `'business_owner'`) |
| business_name    | text, nullable — set for business owners                     |
| business_address | text, nullable — set for business owners                     |
| business_phone   | text, nullable — set for business owners                     |
| business_website | text, nullable — set for business owners                     |

> Business owner vs. customer is tracked on `profiles.account_type` (see
> migration `20260625_add_business_account_fields_to_profiles.sql`). The
> `business_*` fields are only meaningful when `account_type = 'business_owner'`.
>
> **RLS:** row level security is enabled; authenticated users may only
> `select`/`insert`/`update` their own profile row (`auth.uid() = id`), which
> scopes the business fields to the owning user. The `insert` policy lets the
> business onboarding flow create the profile row when one does not exist yet.

## `events`
Chamber / local events. Currently a minimal stub in the mobile schema.

| column     | notes        |
|------------|--------------|
| id         | primary key  |
| title      | event title  |
| created_at | timestamp    |
