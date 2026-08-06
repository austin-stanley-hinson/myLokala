-- Unified payment ledger for every Lokala money movement.
--
-- One table records both payment kinds so there is a single financial source of
-- truth and a single webhook path that finalizes them:
--   * merchant_qr_payment      — customer scans a business QR (destination charge)
--   * gift_certificate_purchase — platform charge that becomes Lokala credit
--
-- All money is INTEGER CENTS. No floats anywhere.
--
-- Ownership rules (deliberate, matches gift_certificates):
--   * Clients never write this table. RLS grants SELECT only; there are no
--     insert/update/delete policies. Rows are created by the server payment
--     service and advanced only by the verified Stripe webhook.
--   * Status transitions are additionally guarded by a BEFORE UPDATE trigger, so
--     a terminal state cannot be regressed even by service-role code or a
--     duplicate/out-of-order webhook delivery.
--
-- Approved fee policy encoded here (Austin, 2026-08-06):
--   * Tips are FEE-FREE. The fee base is subtotal_cents only; tip_cents passes
--     through to the merchant in full.
--   * Stripe's processing cost is BUILT INTO Lokala's published fee. Lokala nets
--     the difference. stripe_fee_cents is recorded after settlement (nullable,
--     since it is unknown at creation time) for margin reporting.
--   * application_fee_cents carries BOTH the customer fee and the merchant fee,
--     so a merchant's Stripe payout equals what they actually earned.
--
-- STILL UNDECIDED — the direct QR-payment fee (rate and who pays) has not been
-- supplied by the founder. The columns below exist and default to 0 so pricing
-- can be switched on by the fee engine WITHOUT a destructive migration. Do not
-- invent a QR fee; merchant_qr_payment rows carry zero fees until the policy is
-- approved and a new fee_policy_version is issued.

-- ---------------------------------------------------------------------------
-- payment_transactions
-- ---------------------------------------------------------------------------

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),

  -- Idempotency boundary. One customer payment attempt == one client_request_id.
  -- Repeated requests with the same id must return the existing payment session
  -- and must never create a second PaymentIntent.
  client_request_id uuid not null unique,

  kind text not null
    check (kind in ('merchant_qr_payment', 'gift_certificate_purchase')),

  -- Nullable while the mobile app is still rolled out without an Authorization
  -- header, and for guest gift checkout. SET NULL (never CASCADE): deleting a
  -- user must not delete financial history.
  customer_id uuid references auth.users(id) on delete set null,

  -- The merchant. profiles.id == auth.users.id; there is no businesses table.
  -- RESTRICT (never CASCADE): a recorded payment must outlive profile deletion.
  -- Null for gift_certificate_purchase, which has no merchant (enforced below).
  business_owner_id uuid references public.profiles(id) on delete restrict,

  -- Which physical QR was scanned, and the merchant name at payment time.
  -- Snapshots follow the `redemptions` convention: a customer cannot SELECT the
  -- merchant's profiles row under RLS, so a receipt must not need that join.
  qr_public_code text,
  business_name_snapshot text,

  -- Links a gift purchase to the certificate it funds, so the webhook can
  -- finalize delivery from this ledger.
  gift_certificate_id uuid references public.gift_certificates(id) on delete set null,

  -- Amounts ---------------------------------------------------------------
  subtotal_cents integer not null check (subtotal_cents > 0),   -- the fee base
  tip_cents      integer not null default 0 check (tip_cents >= 0),      -- fee-free
  credit_cents   integer not null default 0 check (credit_cents >= 0),   -- Lokala credit applied

  -- Fees. Zero until the fee engine and an approved policy populate them.
  customer_fee_cents    integer not null default 0 check (customer_fee_cents >= 0),
  merchant_fee_cents    integer not null default 0 check (merchant_fee_cents >= 0),
  application_fee_cents integer not null default 0 check (application_fee_cents >= 0),

  -- What the card is actually charged.
  charged_cents integer not null check (charged_cents >= 0),

  -- Known only after settlement, so both are nullable.
  stripe_fee_cents  integer check (stripe_fee_cents >= 0),
  merchant_net_cents integer check (merchant_net_cents >= 0),

  currency text not null default 'usd',

  -- Which fee schedule produced the numbers above. Immutable per transaction:
  -- repricing issues a new version, it never rewrites historical rows.
  fee_policy_version text not null default 'v0-no-fees',

  -- Status ----------------------------------------------------------------
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'canceled')),

  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  livemode boolean,

  -- Only Stripe's machine-readable code. Raw messages stay in server logs so
  -- nothing quotable to a customer can leak through the API.
  failure_code text,

  -- Refunds. A refunded payment keeps status 'succeeded' (the charge really did
  -- succeed); refund_status is the separate axis, mirroring Stripe.
  refund_status text not null default 'none'
    check (refund_status in ('none', 'partial', 'full')),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  application_fee_refunded_cents integer not null default 0
    check (application_fee_refunded_cents >= 0),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  succeeded_at timestamptz,
  failed_at    timestamptz,
  canceled_at  timestamptz,
  refunded_at  timestamptz,

  -- Definitional identity: what the customer is charged is the subtotal plus a
  -- fee-free tip plus any customer fee, less credit already held by Lokala.
  constraint payment_transactions_charged_matches
    check (charged_cents = subtotal_cents + tip_cents + customer_fee_cents - credit_cents),

  -- Approved decision: the Connect application fee carries both fee sides.
  constraint payment_transactions_application_fee_matches
    check (application_fee_cents = customer_fee_cents + merchant_fee_cents),

  constraint payment_transactions_credit_within_total
    check (credit_cents <= subtotal_cents + tip_cents),

  constraint payment_transactions_refund_within_charge
    check (refunded_cents <= charged_cents),

  -- A merchant payment must identify its merchant and the QR that produced it.
  constraint payment_transactions_merchant_kind_complete
    check (
      kind <> 'merchant_qr_payment'
      or (business_owner_id is not null and qr_public_code is not null)
    ),

  -- A gift purchase has no merchant and never routes funds to one.
  constraint payment_transactions_gift_kind_has_no_merchant
    check (
      kind <> 'gift_certificate_purchase'
      or (business_owner_id is null and merchant_fee_cents = 0)
    )
);

create index if not exists payment_transactions_customer_idx
  on public.payment_transactions (customer_id, created_at desc);

create index if not exists payment_transactions_business_idx
  on public.payment_transactions (business_owner_id, created_at desc);

create index if not exists payment_transactions_gift_idx
  on public.payment_transactions (gift_certificate_id);

-- Drives the reconciliation sweep for transactions stuck mid-flight.
create index if not exists payment_transactions_open_idx
  on public.payment_transactions (status, created_at)
  where status in ('pending', 'processing');

-- keep updated_at current (same pattern as business_qr_codes / gift_certificates)
create or replace function public.set_payment_transactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_payment_transactions_updated_at
  on public.payment_transactions;
create trigger set_payment_transactions_updated_at
  before update on public.payment_transactions
  for each row
  execute function public.set_payment_transactions_updated_at();

-- ---------------------------------------------------------------------------
-- Guarded status transitions
-- ---------------------------------------------------------------------------
-- Enforced in the database rather than only in the webhook handler, so a
-- duplicate or out-of-order Stripe delivery cannot regress a settled payment,
-- and neither can a bug in service-role code. Same-status updates are allowed
-- because refund bookkeeping updates a row that stays 'succeeded'.

create or replace function public.guard_payment_transaction_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pending'
     and new.status in ('processing', 'succeeded', 'failed', 'canceled') then
    return new;
  end if;

  if old.status = 'processing'
     and new.status in ('succeeded', 'failed', 'canceled') then
    return new;
  end if;

  raise exception
    'illegal payment_transactions status transition: % -> %', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists guard_payment_transaction_status
  on public.payment_transactions;
create trigger guard_payment_transaction_status
  before update of status on public.payment_transactions
  for each row
  execute function public.guard_payment_transaction_status();

-- ---------------------------------------------------------------------------
-- stripe_webhook_events
-- ---------------------------------------------------------------------------
-- The dedupe record for webhook delivery. stripe_event_id is the natural key:
-- claim the row first, then process, then stamp processed_at. A conflicting
-- insert means the event was already seen and must be treated as a no-op.

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  livemode boolean,
  received_at timestamptz not null default now(),
  processed_at timestamptz,          -- null => claimed but unfinished (stuck or failed)
  process_error text
);

-- Surfaces events that were claimed but never completed.
create index if not exists stripe_webhook_events_unprocessed_idx
  on public.stripe_webhook_events (received_at)
  where processed_at is null;

create index if not exists stripe_webhook_events_transaction_idx
  on public.stripe_webhook_events (payment_transaction_id);

-- ---------------------------------------------------------------------------
-- RLS: read-only for the two parties. No client writes, ever.
-- ---------------------------------------------------------------------------

alter table public.payment_transactions enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists "Customers can read own payment transactions"
  on public.payment_transactions;
create policy "Customers can read own payment transactions"
on public.payment_transactions
for select
to authenticated
using (auth.uid() = customer_id);

drop policy if exists "Merchants can read own received payments"
  on public.payment_transactions;
create policy "Merchants can read own received payments"
on public.payment_transactions
for select
to authenticated
using (
  auth.uid() = business_owner_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_type = 'business_owner'
  )
);

-- stripe_webhook_events intentionally has NO policies: RLS is enabled and only
-- the service role (which bypasses RLS) may read or write it. Webhook plumbing
-- is never client-visible.
