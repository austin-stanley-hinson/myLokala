-- RLS policies, grants, and safe views.

-- ---------------------------------------------------------------------------
-- Enable RLS on all public application tables
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.merchant_accounts enable row level security;
alter table public.merchant_members enable row level security;
alter table public.merchant_locations enable row level security;
alter table public.payment_hubs enable row level security;
alter table public.payment_orders enable row level security;
alter table public.balance_purchases enable row level security;
alter table public.credit_lots enable row level security;
alter table public.balance_redemptions enable row level security;
alter table public.credit_consumptions enable row level security;
alter table public.settlement_batches enable row level security;
alter table public.settlement_items enable row level security;

-- Private schema: no grants to anon/authenticated (already revoked at schema level)
alter table app_private.platform_config enable row level security;
alter table app_private.gift_claims enable row level security;
alter table app_private.stripe_connected_accounts enable row level security;
alter table app_private.financial_accounts enable row level security;
alter table app_private.ledger_transactions enable row level security;
alter table app_private.ledger_entries enable row level security;
alter table app_private.stripe_payment_attempts enable row level security;
alter table app_private.stripe_webhook_events enable row level security;
alter table app_private.stripe_transfer_attempts enable row level security;
alter table app_private.refunds enable row level security;
alter table app_private.stripe_disputes enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No client insert/delete — auth trigger + service role only

-- ---------------------------------------------------------------------------
-- Wallets: read own; never write balance as client
-- ---------------------------------------------------------------------------
create policy wallets_select_own
  on public.wallets for select to authenticated
  using (user_id = auth.uid());

-- Explicitly no insert/update/delete policies for authenticated

-- ---------------------------------------------------------------------------
-- Merchant accounts / members / locations / hubs
-- ---------------------------------------------------------------------------
create policy merchant_accounts_select_member
  on public.merchant_accounts for select to authenticated
  using (public.is_merchant_member(id));

create policy merchant_accounts_update_owner_admin
  on public.merchant_accounts for update to authenticated
  using (public.is_merchant_member(id, array['owner', 'admin']))
  with check (public.is_merchant_member(id, array['owner', 'admin']));

-- Creates go through service role / future RPC (prevents self-escalation via insert)
-- No insert policy for authenticated on merchant_accounts

create policy merchant_members_select_same_merchant
  on public.merchant_members for select to authenticated
  using (public.is_merchant_member(merchant_account_id));

-- Users cannot insert/update their own membership to escalate
-- Membership writes: service_role only

create policy merchant_locations_select_member
  on public.merchant_locations for select to authenticated
  using (public.is_merchant_member(merchant_account_id));

create policy merchant_locations_write_owner_admin
  on public.merchant_locations for insert to authenticated
  with check (public.is_merchant_member(merchant_account_id, array['owner', 'admin']));

create policy merchant_locations_update_owner_admin
  on public.merchant_locations for update to authenticated
  using (public.is_merchant_member(merchant_account_id, array['owner', 'admin']))
  with check (public.is_merchant_member(merchant_account_id, array['owner', 'admin']));

create policy payment_hubs_select_member
  on public.payment_hubs for select to authenticated
  using (public.is_merchant_member(merchant_account_id));

-- Hub create/rotate: service_role (cryptographic code generation)

-- ---------------------------------------------------------------------------
-- Purchases / orders / lots / redemptions
-- ---------------------------------------------------------------------------
create policy payment_orders_select_own
  on public.payment_orders for select to authenticated
  using (user_id = auth.uid());

create policy balance_purchases_select_party
  on public.balance_purchases for select to authenticated
  using (
    purchaser_user_id = auth.uid()
    or recipient_user_id = auth.uid()
  );

create policy credit_lots_select_own_wallet
  on public.credit_lots for select to authenticated
  using (
    exists (
      select 1 from public.wallets w
      where w.id = credit_lots.wallet_id
        and w.user_id = auth.uid()
    )
  );

create policy balance_redemptions_select_customer
  on public.balance_redemptions for select to authenticated
  using (customer_user_id = auth.uid());

create policy balance_redemptions_select_merchant
  on public.balance_redemptions for select to authenticated
  using (public.is_merchant_member(merchant_account_id));

create policy credit_consumptions_select_customer
  on public.credit_consumptions for select to authenticated
  using (
    exists (
      select 1 from public.balance_redemptions r
      where r.id = credit_consumptions.balance_redemption_id
        and r.customer_user_id = auth.uid()
    )
  );

create policy credit_consumptions_select_merchant
  on public.credit_consumptions for select to authenticated
  using (
    exists (
      select 1 from public.balance_redemptions r
      where r.id = credit_consumptions.balance_redemption_id
        and public.is_merchant_member(r.merchant_account_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Settlements
-- ---------------------------------------------------------------------------
create policy settlement_batches_select_member
  on public.settlement_batches for select to authenticated
  using (public.is_merchant_member(merchant_account_id));

create policy settlement_items_select_member
  on public.settlement_items for select to authenticated
  using (
    exists (
      select 1 from public.settlement_batches b
      where b.id = settlement_items.settlement_batch_id
        and public.is_merchant_member(b.merchant_account_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant select on public.wallets to authenticated;
grant select, update on public.merchant_accounts to authenticated;
grant select on public.merchant_members to authenticated;
grant select, insert, update on public.merchant_locations to authenticated;
grant select on public.payment_hubs to authenticated;
grant select on public.payment_orders to authenticated;
grant select on public.balance_purchases to authenticated;
grant select on public.credit_lots to authenticated;
grant select on public.balance_redemptions to authenticated;
grant select on public.credit_consumptions to authenticated;
grant select on public.settlement_batches to authenticated;
grant select on public.settlement_items to authenticated;

grant all on all tables in schema public to service_role;
grant all on all tables in schema app_private to service_role;
grant all on all sequences in schema public to service_role;
grant all on all sequences in schema app_private to service_role;
grant execute on all functions in schema app_private to service_role;

-- Safe merchant payment readiness view (no Stripe account IDs)
create or replace view public.merchant_payment_readiness
with (security_invoker = true)
as
select
  ma.id as merchant_account_id,
  ma.display_name,
  ma.status as merchant_status,
  exists (
    select 1
    from public.payment_hubs h
    where h.merchant_account_id = ma.id
      and h.status = 'active'
  ) as has_active_payment_hub
from public.merchant_accounts ma;

grant select on public.merchant_payment_readiness to authenticated;
