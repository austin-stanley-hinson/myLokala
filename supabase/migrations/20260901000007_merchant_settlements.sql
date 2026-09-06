-- Merchant settlement batches, items, and Stripe transfer attempts.

create table public.settlement_batches (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id uuid not null references public.merchant_accounts (id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  gross_subtotal_cents bigint not null default 0 check (gross_subtotal_cents >= 0),
  tips_cents bigint not null default 0 check (tips_cents >= 0),
  merchant_fees_cents bigint not null default 0 check (merchant_fees_cents >= 0),
  net_payable_cents bigint not null default 0 check (net_payable_cents >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'reversed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (period_end > period_start),
  check (
    net_payable_cents = gross_subtotal_cents + tips_cents - merchant_fees_cents
  )
);

create index settlement_batches_merchant_idx
  on public.settlement_batches (merchant_account_id, created_at desc);

create trigger settlement_batches_set_updated_at
  before update on public.settlement_batches
  for each row execute function public.set_updated_at();

create trigger settlement_batches_forbid_delete
  before delete on public.settlement_batches
  for each row execute function public.forbid_hard_delete();

create table public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_batch_id uuid not null
    references public.settlement_batches (id) on delete restrict,
  balance_redemption_id uuid not null
    references public.balance_redemptions (id) on delete restrict,
  payable_cents bigint not null check (payable_cents >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (balance_redemption_id)
);

create index settlement_items_batch_idx on public.settlement_items (settlement_batch_id);

create trigger settlement_items_forbid_delete
  before delete on public.settlement_items
  for each row execute function public.forbid_hard_delete();

-- A completed redemption may belong to at most one active (non-reversed) settlement.
-- Unique on balance_redemption_id already enforces one item; application must not
-- attach reversed batches' items to new batches without reversing status first.

create table app_private.stripe_transfer_attempts (
  id uuid primary key default gen_random_uuid(),
  settlement_batch_id uuid not null
    references public.settlement_batches (id) on delete restrict,
  stripe_transfer_id text,
  idempotency_key text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed')),
  failure_code text,
  failure_message text,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index stripe_transfer_attempts_batch_idx
  on app_private.stripe_transfer_attempts (settlement_batch_id, created_at desc);

create trigger stripe_transfer_attempts_set_updated_at
  before update on app_private.stripe_transfer_attempts
  for each row execute function public.set_updated_at();

-- Do not overwrite failed attempts: updates that clear failure or change transfer id
-- on a failed row are rejected; create a new attempt instead.
create or replace function app_private.guard_transfer_attempt_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'failed' then
    if new.status = 'failed'
       and new.stripe_transfer_id is not distinct from old.stripe_transfer_id
       and new.idempotency_key = old.idempotency_key
       and new.amount_cents = old.amount_cents then
      -- Allow metadata-only updates (e.g. attempt_count bump is discouraged; prefer new row)
      if new.attempt_count <> old.attempt_count then
        raise exception 'Do not mutate failed transfer attempts; insert a new attempt'
          using errcode = 'restrict_violation';
      end if;
      return new;
    end if;
    raise exception 'Failed Stripe transfer attempts are immutable; insert a new attempt'
      using errcode = 'restrict_violation';
  end if;
  if old.status = 'succeeded' and new is distinct from old then
    raise exception 'Succeeded Stripe transfer attempts are immutable'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger stripe_transfer_attempts_guard_update
  before update on app_private.stripe_transfer_attempts
  for each row execute function app_private.guard_transfer_attempt_update();

create trigger stripe_transfer_attempts_forbid_delete
  before delete on app_private.stripe_transfer_attempts
  for each row execute function public.forbid_hard_delete();
