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

> Note: there is **no** `description`, `image_url`, or `terms` column on `deals`.

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
| column      | notes                       |
|-------------|-----------------------------|
| id          | references auth user        |
| full_name   | text                        |
| member_id   | membership identifier       |
| member_type | membership tier/type        |
| created_at  | timestamp                   |

## `events`
Chamber / local events. Currently a minimal stub in the mobile schema.

| column     | notes        |
|------------|--------------|
| id         | primary key  |
| title      | event title  |
| created_at | timestamp    |
