-- Platform config, payment orders, balance purchases, gift claims, credit lots.

create table app_private.platform_config (
  id text primary key default 'mvp',
  max_balance_purchase_cents bigint not null check (max_balance_purchase_cents > 0),
  max_wallet_balance_cents bigint not null check (max_wallet_balance_cents > 0),
  merchant_redemption_fee_bps integer not null check (merchant_redemption_fee_bps >= 0),
  currency text not null check (currency = 'USD'),
  pricing_version text not null,
  -- Environment Stripe mode. Merchants are payment-ready only when Connect.livemode matches.
  stripe_livemode boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger platform_config_set_updated_at
  before update on app_private.platform_config
  for each row execute function public.set_updated_at();

insert into app_private.platform_config (
  id,
  max_balance_purchase_cents,
  max_wallet_balance_cents,
  merchant_redemption_fee_bps,
  currency,
  pricing_version,
  stripe_livemode
) values (
  'mvp',
  50000,
  50000,
  250,
  'USD',
  'colin_v1',
  false
);

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind text not null check (kind in ('balance_purchase')),
  subtotal_cents bigint not null check (subtotal_cents > 0),
  customer_fee_cents bigint not null check (customer_fee_cents >= 0),
  total_cents bigint not null check (total_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  pricing_version text not null,
  client_request_id text not null,
  status text not null default 'created'
    check (status in (
      'created', 'awaiting_payment', 'paid', 'failed', 'canceled', 'refunded', 'disputed'
    )),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (total_cents = subtotal_cents + customer_fee_cents),
  unique (user_id, client_request_id)
);

create index payment_orders_user_id_idx on public.payment_orders (user_id);

create trigger payment_orders_set_updated_at
  before update on public.payment_orders
  for each row execute function public.set_updated_at();

create table public.balance_purchases (
  id uuid primary key default gen_random_uuid(),
  purchaser_user_id uuid not null references public.profiles (id) on delete restrict,
  purchase_kind text not null check (purchase_kind in ('self_top_up', 'gift')),
  recipient_user_id uuid references public.profiles (id) on delete restrict,
  face_value_cents bigint not null check (face_value_cents > 0),
  customer_fee_cents bigint not null check (customer_fee_cents >= 0),
  total_paid_cents bigint not null check (total_paid_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  pricing_version text not null,
  payment_order_id uuid not null unique references public.payment_orders (id) on delete restrict,
  gift_message text,
  status text not null default 'awaiting_payment'
    check (status in (
      'awaiting_payment',
      'paid',
      'pending_claim',
      'delivered',
      'refunded',
      'disputed',
      'canceled'
    )),
  paid_at timestamptz,
  delivered_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (total_paid_cents = face_value_cents + customer_fee_cents),
  check (
    (purchase_kind = 'self_top_up' and recipient_user_id = purchaser_user_id)
    or (purchase_kind = 'gift')
  )
);

create index balance_purchases_purchaser_idx on public.balance_purchases (purchaser_user_id);
create index balance_purchases_recipient_idx on public.balance_purchases (recipient_user_id);

create trigger balance_purchases_set_updated_at
  before update on public.balance_purchases
  for each row execute function public.set_updated_at();

-- Pending gift claims: recipient contact + token hash only (private)
create table app_private.gift_claims (
  id uuid primary key default gen_random_uuid(),
  balance_purchase_id uuid not null unique
    references public.balance_purchases (id) on delete restrict,
  recipient_email_normalized text not null,
  claim_token_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'expired', 'canceled')),
  claimed_by_user_id uuid references public.profiles (id) on delete restrict,
  claimed_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (status = 'claimed' and claimed_by_user_id is not null and claimed_at is not null)
    or (status <> 'claimed')
  )
);

create index gift_claims_email_idx
  on app_private.gift_claims (recipient_email_normalized)
  where status = 'pending';

create trigger gift_claims_set_updated_at
  before update on app_private.gift_claims
  for each row execute function public.set_updated_at();

-- Credit lots preserve purchase provenance for refunds/disputes
create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  balance_purchase_id uuid not null references public.balance_purchases (id) on delete restrict,
  original_amount_cents bigint not null check (original_amount_cents > 0),
  remaining_amount_cents bigint not null,
  status text not null default 'available'
    check (status in ('available', 'held', 'exhausted', 'reversed')),
  available_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    remaining_amount_cents >= 0
    and remaining_amount_cents <= original_amount_cents
  ),
  unique (balance_purchase_id, wallet_id)
);

create index credit_lots_wallet_fifo_idx
  on public.credit_lots (wallet_id, available_at, created_at)
  where status = 'available' and remaining_amount_cents > 0;

create trigger credit_lots_set_updated_at
  before update on public.credit_lots
  for each row execute function public.set_updated_at();

create trigger credit_lots_forbid_delete
  before delete on public.credit_lots
  for each row execute function public.forbid_hard_delete();

create trigger balance_purchases_forbid_delete
  before delete on public.balance_purchases
  for each row execute function public.forbid_hard_delete();

create trigger payment_orders_forbid_delete
  before delete on public.payment_orders
  for each row execute function public.forbid_hard_delete();
