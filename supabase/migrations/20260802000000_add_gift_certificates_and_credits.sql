-- Gift certificates + Lokala credit ledger.
--
-- Funds model (Austin, 2026-08-02): buying a gift certificate is a PLATFORM
-- charge (no Stripe Connect transfer). The money becomes spendable "Lokala
-- credit" on the recipient's account. Credit is only transferred to a business
-- later, when the recipient spends it at that business through its QR code
-- (that draw-down/transfer is a SEPARATE, future change to the merchant-pay
-- flow — NOT in this migration).
--
-- All state transitions go through SECURITY DEFINER functions (same pattern as
-- get_business_for_qr_code); there are intentionally NO direct insert/update
-- RLS policies on these tables, so rows can only change through the vetted RPCs.
--
-- SECURITY (test-mode limitation, must harden before go-live): delivery is
-- gated by the /api/stripe/gift-certificate/confirm route, which retrieves the
-- PaymentIntent from Stripe and checks status = 'succeeded' before calling
-- deliver_gift_certificate(). Before production this MUST move to a Stripe
-- webhook with signature verification so credit can never be issued without a
-- verified Stripe event.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.gift_certificates (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references auth.users(id) on delete set null,      -- null for guest checkout
  recipient_email text not null,
  recipient_name text,
  recipient_id uuid references auth.users(id) on delete set null,  -- resolved on delivery
  amount_cents integer not null check (amount_cents > 0),          -- gift face value
  fee_cents integer not null default 0 check (fee_cents >= 0),     -- consumer processing fee
  total_cents integer not null check (total_cents > 0),            -- amount charged to the card
  currency text not null default 'usd',
  note text,
  payment_method text not null default 'card',
  stripe_payment_intent_id text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'delivered', 'refunded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists gift_certificates_recipient_email_idx
  on public.gift_certificates (lower(recipient_email));
create index if not exists gift_certificates_buyer_idx
  on public.gift_certificates (buyer_id);

-- Append-only credit movements. Balance = sum(amount_cents) for a user.
create table if not exists public.lokala_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null,  -- positive = credit added, negative = spent
  type text not null check (type in ('gift_received', 'spend', 'refund', 'adjustment')),
  gift_certificate_id uuid references public.gift_certificates(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists lokala_credit_ledger_user_idx
  on public.lokala_credit_ledger (user_id);

-- A gift certificate may credit its recipient at most once, even if delivery is
-- retried. This is the hard idempotency guarantee for money movement.
create unique index if not exists lokala_credit_ledger_one_gift_credit
  on public.lokala_credit_ledger (gift_certificate_id)
  where type = 'gift_received';

-- keep updated_at current (same pattern as business_qr_codes)
create or replace function public.set_gift_certificates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_gift_certificates_updated_at on public.gift_certificates;
create trigger set_gift_certificates_updated_at
  before update on public.gift_certificates
  for each row
  execute function public.set_gift_certificates_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: read-only for owners; all writes go through the RPCs below.
-- ---------------------------------------------------------------------------

alter table public.gift_certificates enable row level security;
alter table public.lokala_credit_ledger enable row level security;

-- A user can see gift certificates they bought or that are addressed to them.
drop policy if exists "View own or received gift certificates" on public.gift_certificates;
create policy "View own or received gift certificates"
on public.gift_certificates
for select
to authenticated
using (
  auth.uid() = buyer_id
  or auth.uid() = recipient_id
  or lower(recipient_email) = lower(coalesce(auth.email(), ''))
);

-- A user can see only their own credit ledger.
drop policy if exists "View own credit ledger" on public.lokala_credit_ledger;
create policy "View own credit ledger"
on public.lokala_credit_ledger
for select
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER) — the only way to write these tables.
-- ---------------------------------------------------------------------------

-- Create a pending gift certificate for a just-created PaymentIntent.
-- buyer_id is the caller (null for anonymous/guest checkout).
create or replace function public.create_gift_certificate(
  p_recipient_email text,
  p_recipient_name text,
  p_amount_cents integer,
  p_fee_cents integer,
  p_total_cents integer,
  p_note text,
  p_payment_method text,
  p_stripe_payment_intent_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_recipient_email), '') = '' then
    raise exception 'recipient_email is required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_cents must be positive';
  end if;
  if p_total_cents is null or p_total_cents <> p_amount_cents + coalesce(p_fee_cents, 0) then
    raise exception 'total_cents must equal amount_cents + fee_cents';
  end if;

  insert into public.gift_certificates (
    buyer_id, recipient_email, recipient_name, amount_cents, fee_cents,
    total_cents, note, payment_method, stripe_payment_intent_id, status
  ) values (
    auth.uid(), trim(p_recipient_email), nullif(trim(p_recipient_name), ''),
    p_amount_cents, coalesce(p_fee_cents, 0), p_total_cents,
    nullif(trim(p_note), ''), coalesce(nullif(trim(p_payment_method), ''), 'card'),
    p_stripe_payment_intent_id, 'pending'
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Mark a paid gift certificate delivered and credit the recipient's Lokala
-- account. Idempotent: safe to call more than once for the same PaymentIntent.
-- The CALLER (confirm route) must first verify with Stripe that the payment
-- succeeded — this function cannot reach Stripe itself.
create or replace function public.deliver_gift_certificate(
  p_payment_intent_id text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gift public.gift_certificates%rowtype;
  v_recipient uuid;
begin
  select * into v_gift
  from public.gift_certificates
  where stripe_payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'gift certificate not found for payment intent';
  end if;

  -- Already delivered → nothing to do (idempotent).
  if v_gift.status = 'delivered' then
    return 'delivered';
  end if;

  -- Move pending → paid.
  if v_gift.status = 'pending' then
    update public.gift_certificates
      set status = 'paid'
      where id = v_gift.id;
    v_gift.status := 'paid';
  end if;

  -- Resolve the recipient by email. If they don't have an account yet, leave
  -- the gift 'paid' — claim_pending_gift_certificates() delivers it once they
  -- sign up.
  select id into v_recipient
  from auth.users
  where lower(email) = lower(v_gift.recipient_email)
  limit 1;

  if v_recipient is null then
    return 'paid';
  end if;

  -- Credit the recipient (unique index guarantees at most one credit per gift).
  insert into public.lokala_credit_ledger (user_id, amount_cents, type, gift_certificate_id, description)
  values (v_recipient, v_gift.amount_cents, 'gift_received', v_gift.id, 'Gift certificate')
  on conflict (gift_certificate_id) where type = 'gift_received' do nothing;

  update public.gift_certificates
    set status = 'delivered', recipient_id = v_recipient, delivered_at = now()
    where id = v_gift.id;

  return 'delivered';
end;
$$;

-- Deliver any paid-but-undelivered gifts addressed to the caller's email.
-- Call this after a user signs up / logs in. Returns the number delivered.
create or replace function public.claim_pending_gift_certificates()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := auth.email();
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_gift public.gift_certificates%rowtype;
begin
  if v_uid is null or coalesce(v_email, '') = '' then
    return 0;
  end if;

  for v_gift in
    select * from public.gift_certificates
    where status = 'paid' and lower(recipient_email) = lower(v_email)
    for update
  loop
    insert into public.lokala_credit_ledger (user_id, amount_cents, type, gift_certificate_id, description)
    values (v_uid, v_gift.amount_cents, 'gift_received', v_gift.id, 'Gift certificate')
    on conflict (gift_certificate_id) where type = 'gift_received' do nothing;

    update public.gift_certificates
      set status = 'delivered', recipient_id = v_uid, delivered_at = now()
      where id = v_gift.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Current spendable Lokala credit balance (in cents) for the caller.
create or replace function public.get_credit_balance()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(amount_cents), 0)::integer
  from public.lokala_credit_ledger
  where user_id = auth.uid();
$$;

-- Guests (anon) can start a purchase and confirm it; balance/claim need a session.
grant execute on function public.create_gift_certificate(text, text, integer, integer, integer, text, text, text) to anon, authenticated;
grant execute on function public.deliver_gift_certificate(text) to anon, authenticated;
grant execute on function public.claim_pending_gift_certificates() to authenticated;
grant execute on function public.get_credit_balance() to authenticated;
