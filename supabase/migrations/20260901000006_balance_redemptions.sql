-- Balance redemptions and credit-lot consumption.

create table public.balance_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.profiles (id) on delete restrict,
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  merchant_account_id uuid not null references public.merchant_accounts (id) on delete restrict,
  merchant_location_id uuid references public.merchant_locations (id) on delete set null,
  payment_hub_id uuid not null references public.payment_hubs (id) on delete restrict,
  subtotal_cents bigint not null check (subtotal_cents > 0),
  tip_cents bigint not null default 0 check (tip_cents >= 0),
  balance_debited_cents bigint not null check (balance_debited_cents > 0),
  merchant_fee_bps integer not null check (merchant_fee_bps >= 0),
  merchant_fee_cents bigint not null check (merchant_fee_cents >= 0),
  merchant_payable_cents bigint not null check (merchant_payable_cents >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  client_request_id text not null,
  confirmation_code text not null,
  status text not null default 'completed'
    check (status in ('completed', 'reversed', 'disputed')),
  created_at timestamptz not null default timezone('utc', now()),
  check (balance_debited_cents = subtotal_cents + tip_cents),
  check (merchant_payable_cents = subtotal_cents - merchant_fee_cents + tip_cents),
  unique (customer_user_id, client_request_id),
  unique (confirmation_code)
);

create index balance_redemptions_merchant_idx
  on public.balance_redemptions (merchant_account_id, created_at desc);

create index balance_redemptions_customer_idx
  on public.balance_redemptions (customer_user_id, created_at desc);

create trigger balance_redemptions_forbid_delete
  before delete on public.balance_redemptions
  for each row execute function public.forbid_hard_delete();

create table public.credit_consumptions (
  id uuid primary key default gen_random_uuid(),
  balance_redemption_id uuid not null
    references public.balance_redemptions (id) on delete restrict,
  credit_lot_id uuid not null
    references public.credit_lots (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (balance_redemption_id, credit_lot_id)
);

create index credit_consumptions_lot_idx on public.credit_consumptions (credit_lot_id);

create trigger credit_consumptions_forbid_delete
  before delete on public.credit_consumptions
  for each row execute function public.forbid_hard_delete();

-- Enforce merchant_fee_cents == round(subtotal * bps / 10000)
create or replace function public.validate_balance_redemption_fee()
returns trigger
language plpgsql
as $$
declare
  expected bigint;
begin
  expected := round((new.subtotal_cents::numeric * new.merchant_fee_bps) / 10000.0)::bigint;
  if new.merchant_fee_cents <> expected then
    raise exception 'merchant_fee_cents % does not match expected % for subtotal % at % bps',
      new.merchant_fee_cents, expected, new.subtotal_cents, new.merchant_fee_bps;
  end if;
  return new;
end;
$$;

create trigger balance_redemptions_validate_fee
  before insert or update on public.balance_redemptions
  for each row execute function public.validate_balance_redemption_fee();
