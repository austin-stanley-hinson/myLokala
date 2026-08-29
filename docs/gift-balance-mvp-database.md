# Gift-balance MVP database

Local-only schema for Lokala’s rebuild. This document describes the schema on branch `rebuild/gift-balance-mvp`. It does **not** apply to the legacy remote Supabase project.

## Scope

**In scope:** profiles, merchant accounts/members/locations, payment hubs, Stripe Connect readiness records, wallets, balance purchases/gifts, credit lots, double-entry ledger, balance redemptions, settlements, Stripe payment/webhook scaffolding, RLS, atomic functions.

**Deferred (later phase):** MMCC discounts, catalog businesses, deals, saved deals, discount redemptions, chamber events, legacy imports.

## Schemas

| Schema | Purpose | Data API |
|--------|---------|----------|
| `public` | Application tables clients may read under RLS | Exposed |
| `app_private` | Integration + ledger internals | **Not exposed** |

## Table ownership

### Identity
- `public.profiles` — one row per `auth.users`; no `account_type`
- `public.wallets` — cached USD balance + optimistic `version`

### Merchant
- `public.merchant_accounts`
- `public.merchant_members` — **authorization source** (not profile metadata)
- `public.merchant_locations`
- `public.payment_hubs` — permanent hubs; QR uses `public_code` only
- `app_private.stripe_connected_accounts` — Connect readiness; unique per `(merchant, livemode)`

### Money in
- `app_private.platform_config` — MVP limits + `colin_v1` + 250 bps merchant fee
- `public.payment_orders` — durable checkout intent; unique `(user_id, client_request_id)`
- `public.balance_purchases` — self top-up or gift; stores face value, customer fee, total, pricing version
- `app_private.gift_claims` — normalized email + **token hash only**
- `public.credit_lots` — provenance lots; `0 ≤ remaining ≤ original`

### Ledger
- `app_private.financial_accounts`
- `app_private.ledger_transactions` — unique `idempotency_key`
- `app_private.ledger_entries` — signed cents; posted txns must sum to 0

### Money out
- `public.balance_redemptions` — spend at hub; tip fee-free; 2.5% of subtotal
- `public.credit_consumptions` — FIFO lot mapping
- `public.settlement_batches` / `public.settlement_items`
- `app_private.stripe_transfer_attempts` — failed attempts are not overwritten

### Stripe scaffolding
- `app_private.stripe_payment_attempts`
- `app_private.stripe_webhook_events` + `claim_stripe_webhook_event` / `complete_stripe_webhook_event`
- `app_private.refunds`, `app_private.stripe_disputes`

## Money movement

1. **Purchase:** client creates order/purchase via future server API → Stripe PaymentIntent → webhook → `app_private.issue_balance_purchase` → credit lot + wallet cache + ledger.
2. **Gift (unknown recipient):** issuance posts unclaimed liability + `gift_claims`; later `claim_pending_gift` moves liability → claimant wallet/lot.
3. **Redeem:** authenticated `redeem_lokala_balance(public_code, subtotal, tip, client_request_id)` locks wallet, FIFO-consumes lots, posts merchant payable + fee revenue, returns confirmation code.
4. **Settle:** batch redemptions → transfer attempts (application layer; tables ready).

Customer purchase fees are calculated in application code (`src/lib/payments/fees.ts`). The database stores the resulting amounts and `pricing_version`; it does not re-implement Colin’s tier table.

## Trust boundaries

| Actor | May |
|-------|-----|
| `anon` | `resolve_payment_hub` only |
| `authenticated` | Read own profile/wallet/purchases/redemptions; redeem via RPC; merchant members read own merchant data |
| `service_role` | Issue/claim gifts, Stripe rows, membership writes, config |

Clients **cannot** mint balance by updating purchase status or wallet rows.

## RLS model (summary)

- Own profile read/update; no client insert
- Own wallet **select only**
- Purchases visible to purchaser or recipient
- Redemptions visible to customer or merchant members
- Settlements visible to merchant members
- No authenticated policies for wallet/ledger/credit writes
- Private schema: no `anon`/`authenticated` usage grants

Membership insert/role escalation is not granted to clients.

## Atomic redemption

`public.redeem_lokala_balance` (SECURITY DEFINER, fixed `search_path`, granted to `authenticated` only):

1. `auth.uid()` customer  
2. Active hub + active merchant  
3. Ready Connect account  
4. Lock wallet; idempotency on `(customer, client_request_id)`  
5. Fee = `round(subtotal * 250 / 10000)`; tip excluded  
6. FIFO lots; update wallet version  
7. Balanced ledger; return receipt  

## Gift issuance and claiming

- `app_private.issue_balance_purchase` — service only; idempotent on purchase id / credit lot uniqueness  
- `app_private.rotate_gift_claim_token` — rotates hash; does not cancel value  
- `app_private.claim_pending_gift` — service only; idempotent for same claimant  

## Settlement lifecycle

`pending → processing → paid | failed → (optional) reversed`. Items uniquely attach a redemption to one batch. New Stripe transfer attempts are inserted on failure rather than mutating failed rows.

## Auth bootstrap

`handle_new_user` creates profile + USD wallet idempotently. It may copy a display name from metadata but **must not** trust metadata for merchant roles or balances.

## Platform configuration

`app_private.platform_config` (id = `mvp`) holds:

- `max_balance_purchase_cents` / `max_wallet_balance_cents` ($500)
- `merchant_redemption_fee_bps` (250)
- `currency` (`USD`)
- `pricing_version` (`colin_v1`) — must match `FEE_POLICY_VERSION` in `src/lib/payments/fees.ts`
- `stripe_livemode` (default `false` for local/test) — merchants are payment-ready only when Connect `livemode` matches

## Merchant onboarding RPC

`public.create_merchant_account(...)` (authenticated):

- Creator is always `auth.uid()`
- Inserts `merchant_accounts` (`draft`) + active `owner` membership atomically
- Does **not** create Stripe Connect rows or payment hubs
- Rejects blank display names (full rollback)

## Connect readiness

`app_private.merchant_connect_is_ready(merchant_id, platform_stripe_livemode)` requires:

- matching `livemode`
- `onboarding_status = complete`
- `charges_enabled`, `payouts_enabled`, `details_submitted`

```bash
# When Docker + Supabase CLI are available (not linked to remote):
supabase start
supabase db reset
supabase test db
```

Do **not** run `supabase db push`, `--linked`, or remote resets from this branch.

## Deferred MMCC catalog phase

A future phase will add Lokala-managed offers (`offers` / `offer_redemptions`) separate from `balance_redemptions`, plus selective import from the legacy Desktop export folder. That work is intentionally absent here.
