-- Atomic service functions: balance issuance, gift claim, balance redemption.

create or replace function app_private.assert_service_role()
returns void
language plpgsql
stable
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'This function requires service_role'
      using errcode = '42501';
  end if;
end;
$$;

-- Issue purchased balance after verified Stripe payment (idempotent).
create or replace function app_private.issue_balance_purchase(
  p_balance_purchase_id uuid,
  p_recipient_email_normalized text default null,
  p_claim_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, extensions, pg_temp
as $$
declare
  v_purchase public.balance_purchases%rowtype;
  v_order public.payment_orders%rowtype;
  v_cfg app_private.platform_config%rowtype;
  v_wallet public.wallets%rowtype;
  v_lot_id uuid;
  v_liability uuid;
  v_clearing uuid;
  v_fee_rev uuid;
  v_new_balance bigint;
  v_entries jsonb;
begin
  perform app_private.assert_service_role();

  select * into v_cfg from app_private.platform_config where id = 'mvp' for share;
  select * into v_purchase
  from public.balance_purchases
  where id = p_balance_purchase_id
  for update;

  if not found then
    raise exception 'balance_purchase not found';
  end if;

  if v_purchase.status in ('delivered', 'pending_claim') then
    return jsonb_build_object(
      'status', v_purchase.status,
      'balance_purchase_id', v_purchase.id,
      'idempotent', true
    );
  end if;

  if v_purchase.status not in ('awaiting_payment', 'paid') then
    raise exception 'balance_purchase status % cannot be issued', v_purchase.status;
  end if;

  if v_purchase.face_value_cents > v_cfg.max_balance_purchase_cents then
    raise exception 'face_value exceeds max_balance_purchase_cents';
  end if;

  select * into v_order
  from public.payment_orders
  where id = v_purchase.payment_order_id
  for update;

  v_clearing := app_private.platform_account_id('stripe_platform_clearing');
  v_fee_rev := app_private.platform_account_id('customer_fee_revenue');

  -- Self top-up or gift to known user
  if v_purchase.purchase_kind = 'self_top_up'
     or v_purchase.recipient_user_id is not null then
    if v_purchase.recipient_user_id is null then
      raise exception 'recipient_user_id required for delivery';
    end if;

    select * into v_wallet
    from public.wallets
    where user_id = v_purchase.recipient_user_id
      and currency = v_purchase.currency
    for update;

    if not found or v_wallet.status <> 'active' then
      raise exception 'Recipient wallet missing or not active';
    end if;

    v_new_balance := v_wallet.balance_cents + v_purchase.face_value_cents;
    if v_new_balance > v_cfg.max_wallet_balance_cents then
      raise exception 'Wallet balance would exceed max_wallet_balance_cents';
    end if;

    insert into public.credit_lots (
      wallet_id,
      balance_purchase_id,
      original_amount_cents,
      remaining_amount_cents,
      status
    ) values (
      v_wallet.id,
      v_purchase.id,
      v_purchase.face_value_cents,
      v_purchase.face_value_cents,
      'available'
    )
    on conflict (balance_purchase_id, wallet_id) do nothing
    returning id into v_lot_id;

    if v_lot_id is null then
      update public.balance_purchases
      set status = 'delivered',
          paid_at = coalesce(paid_at, timezone('utc', now())),
          delivered_at = coalesce(delivered_at, timezone('utc', now()))
      where id = v_purchase.id;

      update public.payment_orders
      set status = 'paid'
      where id = v_order.id and status <> 'paid';

      return jsonb_build_object(
        'status', 'delivered',
        'balance_purchase_id', v_purchase.id,
        'idempotent', true
      );
    end if;

    update public.wallets
    set balance_cents = v_new_balance,
        version = version + 1
    where id = v_wallet.id;

    v_liability := app_private.get_or_create_customer_liability(v_purchase.recipient_user_id);

    if v_purchase.customer_fee_cents > 0 then
      v_entries := jsonb_build_array(
        jsonb_build_object('financial_account_id', v_clearing, 'amount_cents', -v_purchase.total_paid_cents),
        jsonb_build_object('financial_account_id', v_liability, 'amount_cents', v_purchase.face_value_cents),
        jsonb_build_object('financial_account_id', v_fee_rev, 'amount_cents', v_purchase.customer_fee_cents)
      );
    else
      v_entries := jsonb_build_array(
        jsonb_build_object('financial_account_id', v_clearing, 'amount_cents', -v_purchase.total_paid_cents),
        jsonb_build_object('financial_account_id', v_liability, 'amount_cents', v_purchase.face_value_cents)
      );
    end if;

    perform app_private.post_ledger_transaction(
      'balance_issuance',
      'balance_purchase',
      v_purchase.id,
      'issue:' || v_purchase.id::text,
      v_entries
    );

    update public.balance_purchases
    set status = 'delivered',
        paid_at = coalesce(paid_at, timezone('utc', now())),
        delivered_at = timezone('utc', now())
    where id = v_purchase.id;

    update public.payment_orders
    set status = 'paid'
    where id = v_order.id;

    return jsonb_build_object(
      'status', 'delivered',
      'balance_purchase_id', v_purchase.id,
      'wallet_id', v_wallet.id,
      'credit_lot_id', v_lot_id,
      'idempotent', false
    );
  end if;

  -- Gift to unknown recipient
  if p_recipient_email_normalized is null or p_claim_token_hash is null then
    raise exception 'Gift issuance requires recipient email and claim token hash';
  end if;

  insert into app_private.gift_claims (
    balance_purchase_id,
    recipient_email_normalized,
    claim_token_hash,
    status,
    last_sent_at
  ) values (
    v_purchase.id,
    lower(trim(p_recipient_email_normalized)),
    p_claim_token_hash,
    'pending',
    timezone('utc', now())
  )
  on conflict (balance_purchase_id) do nothing;

  v_liability := app_private.platform_account_id('unclaimed_gift_liability');

  if v_purchase.customer_fee_cents > 0 then
    v_entries := jsonb_build_array(
      jsonb_build_object('financial_account_id', v_clearing, 'amount_cents', -v_purchase.total_paid_cents),
      jsonb_build_object('financial_account_id', v_liability, 'amount_cents', v_purchase.face_value_cents),
      jsonb_build_object('financial_account_id', v_fee_rev, 'amount_cents', v_purchase.customer_fee_cents)
    );
  else
    v_entries := jsonb_build_array(
      jsonb_build_object('financial_account_id', v_clearing, 'amount_cents', -v_purchase.total_paid_cents),
      jsonb_build_object('financial_account_id', v_liability, 'amount_cents', v_purchase.face_value_cents)
    );
  end if;

  perform app_private.post_ledger_transaction(
    'unclaimed_gift_issuance',
    'balance_purchase',
    v_purchase.id,
    'issue:' || v_purchase.id::text,
    v_entries
  );

  update public.balance_purchases
  set status = 'pending_claim',
      paid_at = coalesce(paid_at, timezone('utc', now()))
  where id = v_purchase.id;

  update public.payment_orders
  set status = 'paid'
  where id = v_order.id;

  return jsonb_build_object(
    'status', 'pending_claim',
    'balance_purchase_id', v_purchase.id,
    'idempotent', false
  );
end;
$$;

create or replace function app_private.rotate_gift_claim_token(
  p_balance_purchase_id uuid,
  p_new_claim_token_hash text
)
returns void
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
begin
  perform app_private.assert_service_role();

  update app_private.gift_claims
  set claim_token_hash = p_new_claim_token_hash,
      last_sent_at = timezone('utc', now())
  where balance_purchase_id = p_balance_purchase_id
    and status = 'pending';

  if not found then
    raise exception 'No pending gift claim to rotate';
  end if;
end;
$$;

create or replace function app_private.claim_pending_gift(
  p_claim_token_hash text,
  p_claimant_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_claim app_private.gift_claims%rowtype;
  v_purchase public.balance_purchases%rowtype;
  v_cfg app_private.platform_config%rowtype;
  v_wallet public.wallets%rowtype;
  v_lot_id uuid;
  v_unclaimed uuid;
  v_liability uuid;
  v_new_balance bigint;
begin
  perform app_private.assert_service_role();

  select * into v_cfg from app_private.platform_config where id = 'mvp' for share;

  select * into v_claim
  from app_private.gift_claims
  where claim_token_hash = p_claim_token_hash
  for update;

  if not found then
    raise exception 'Invalid claim token';
  end if;

  if v_claim.status = 'claimed'
     and v_claim.claimed_by_user_id = p_claimant_user_id then
    return jsonb_build_object(
      'status', 'claimed',
      'balance_purchase_id', v_claim.balance_purchase_id,
      'idempotent', true
    );
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'Gift claim is not pending (status=%)', v_claim.status;
  end if;

  select * into v_purchase
  from public.balance_purchases
  where id = v_claim.balance_purchase_id
  for update;

  if v_purchase.status <> 'pending_claim' then
    raise exception 'Purchase is not pending claim';
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = p_claimant_user_id
    and currency = v_purchase.currency
  for update;

  if not found or v_wallet.status <> 'active' then
    raise exception 'Claimant wallet missing or not active';
  end if;

  v_new_balance := v_wallet.balance_cents + v_purchase.face_value_cents;
  if v_new_balance > v_cfg.max_wallet_balance_cents then
    raise exception 'Wallet balance would exceed max_wallet_balance_cents';
  end if;

  insert into public.credit_lots (
    wallet_id,
    balance_purchase_id,
    original_amount_cents,
    remaining_amount_cents,
    status
  ) values (
    v_wallet.id,
    v_purchase.id,
    v_purchase.face_value_cents,
    v_purchase.face_value_cents,
    'available'
  )
  on conflict (balance_purchase_id, wallet_id) do nothing
  returning id into v_lot_id;

  if v_lot_id is null then
    update app_private.gift_claims
    set status = 'claimed',
        claimed_by_user_id = p_claimant_user_id,
        claimed_at = coalesce(claimed_at, timezone('utc', now()))
    where id = v_claim.id;

    return jsonb_build_object(
      'status', 'claimed',
      'balance_purchase_id', v_purchase.id,
      'idempotent', true
    );
  end if;

  update public.wallets
  set balance_cents = v_new_balance,
      version = version + 1
  where id = v_wallet.id;

  v_unclaimed := app_private.platform_account_id('unclaimed_gift_liability');
  v_liability := app_private.get_or_create_customer_liability(p_claimant_user_id);

  perform app_private.post_ledger_transaction(
    'gift_claim',
    'balance_purchase',
    v_purchase.id,
    'claim:' || v_purchase.id::text,
    jsonb_build_array(
      jsonb_build_object('financial_account_id', v_unclaimed, 'amount_cents', -v_purchase.face_value_cents),
      jsonb_build_object('financial_account_id', v_liability, 'amount_cents', v_purchase.face_value_cents)
    )
  );

  update app_private.gift_claims
  set status = 'claimed',
      claimed_by_user_id = p_claimant_user_id,
      claimed_at = timezone('utc', now())
  where id = v_claim.id;

  update public.balance_purchases
  set status = 'delivered',
      recipient_user_id = p_claimant_user_id,
      delivered_at = timezone('utc', now())
  where id = v_purchase.id;

  return jsonb_build_object(
    'status', 'claimed',
    'balance_purchase_id', v_purchase.id,
    'wallet_id', v_wallet.id,
    'credit_lot_id', v_lot_id,
    'idempotent', false
  );
end;
$$;

-- Merchant is payment-ready only when Connect matches platform Stripe mode
-- and onboarding/charges/payouts/details are complete.
create or replace function app_private.merchant_connect_is_ready(
  p_merchant_account_id uuid,
  p_stripe_livemode boolean
)
returns boolean
language sql
stable
security definer
set search_path = app_private, pg_temp
as $$
  select exists (
    select 1
    from app_private.stripe_connected_accounts c
    where c.merchant_account_id = p_merchant_account_id
      and c.livemode = p_stripe_livemode
      and c.onboarding_status = 'complete'
      and c.charges_enabled
      and c.payouts_enabled
      and c.details_submitted
  );
$$;

revoke all on function app_private.merchant_connect_is_ready(uuid, boolean) from public;
grant execute on function app_private.merchant_connect_is_ready(uuid, boolean) to service_role;

-- Authenticated merchant onboarding: creator becomes active owner. No Stripe/hub.
create or replace function public.create_merchant_account(
  p_display_name text,
  p_legal_name text default null,
  p_description text default null,
  p_support_email text default null,
  p_support_phone text default null,
  p_website_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_merchant_id uuid;
  v_name text := nullif(trim(p_display_name), '');
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'display_name is required';
  end if;

  insert into public.merchant_accounts (
    display_name,
    legal_name,
    description,
    support_email,
    support_phone,
    website_url,
    status,
    created_by
  ) values (
    v_name,
    nullif(trim(p_legal_name), ''),
    nullif(trim(p_description), ''),
    nullif(trim(p_support_email), ''),
    nullif(trim(p_support_phone), ''),
    nullif(trim(p_website_url), ''),
    'draft',
    v_uid
  )
  returning id into v_merchant_id;

  insert into public.merchant_members (
    merchant_account_id,
    user_id,
    role,
    status
  ) values (
    v_merchant_id,
    v_uid,
    'owner',
    'active'
  );

  return jsonb_build_object(
    'merchant_account_id', v_merchant_id,
    'display_name', v_name,
    'status', 'draft',
    'owner_user_id', v_uid,
    'owner_role', 'owner'
  );
end;
$$;

revoke all on function public.create_merchant_account(text, text, text, text, text, text) from public;
grant execute on function public.create_merchant_account(text, text, text, text, text, text) to authenticated;

create or replace function public.redeem_lokala_balance(
  p_public_code text,
  p_subtotal_cents bigint,
  p_tip_cents bigint,
  p_client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg app_private.platform_config%rowtype;
  v_hub public.payment_hubs%rowtype;
  v_merchant public.merchant_accounts%rowtype;
  v_wallet public.wallets%rowtype;
  v_existing public.balance_redemptions%rowtype;
  v_fee_bps integer;
  v_fee bigint;
  v_debit bigint;
  v_payable bigint;
  v_confirmation text;
  v_redemption_id uuid;
  v_need bigint;
  v_lot public.credit_lots%rowtype;
  v_take bigint;
  v_liability uuid;
  v_merchant_payable uuid;
  v_fee_rev uuid;
  v_entries jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_subtotal_cents is null or p_subtotal_cents <= 0 then
    raise exception 'subtotal_cents must be positive';
  end if;
  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'tip_cents must be >= 0';
  end if;
  if p_client_request_id is null or length(trim(p_client_request_id)) = 0 then
    raise exception 'client_request_id required';
  end if;

  select * into v_existing
  from public.balance_redemptions
  where customer_user_id = v_uid
    and client_request_id = p_client_request_id;

  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'confirmation_code', v_existing.confirmation_code,
      'subtotal_cents', v_existing.subtotal_cents,
      'tip_cents', v_existing.tip_cents,
      'balance_debited_cents', v_existing.balance_debited_cents,
      'merchant_fee_cents', v_existing.merchant_fee_cents,
      'merchant_payable_cents', v_existing.merchant_payable_cents,
      'currency', v_existing.currency,
      'status', v_existing.status,
      'idempotent', true
    );
  end if;

  select * into v_cfg from app_private.platform_config where id = 'mvp' for share;
  v_fee_bps := v_cfg.merchant_redemption_fee_bps;

  select * into v_hub
  from public.payment_hubs
  where public_code = trim(p_public_code)
  for update;

  if not found or v_hub.status <> 'active' then
    raise exception 'Payment hub is not available';
  end if;

  select * into v_merchant
  from public.merchant_accounts
  where id = v_hub.merchant_account_id
  for update;

  if not found or v_merchant.status <> 'active' then
    raise exception 'Merchant is not accepting payments';
  end if;

  if not app_private.merchant_connect_is_ready(v_merchant.id, v_cfg.stripe_livemode) then
    raise exception
      'Merchant Stripe Connect account is not ready for current platform mode (livemode=%)',
      v_cfg.stripe_livemode;
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = v_uid
    and currency = v_cfg.currency
  for update;

  if not found or v_wallet.status <> 'active' then
    raise exception 'Wallet is not available';
  end if;

  v_debit := p_subtotal_cents + p_tip_cents;
  if v_wallet.balance_cents < v_debit then
    raise exception 'Insufficient balance';
  end if;

  v_fee := round((p_subtotal_cents::numeric * v_fee_bps) / 10000.0)::bigint;
  v_payable := p_subtotal_cents - v_fee + p_tip_cents;
  v_confirmation := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));

  insert into public.balance_redemptions (
    customer_user_id,
    wallet_id,
    merchant_account_id,
    merchant_location_id,
    payment_hub_id,
    subtotal_cents,
    tip_cents,
    balance_debited_cents,
    merchant_fee_bps,
    merchant_fee_cents,
    merchant_payable_cents,
    currency,
    client_request_id,
    confirmation_code,
    status
  ) values (
    v_uid,
    v_wallet.id,
    v_merchant.id,
    v_hub.merchant_location_id,
    v_hub.id,
    p_subtotal_cents,
    p_tip_cents,
    v_debit,
    v_fee_bps,
    v_fee,
    v_payable,
    v_cfg.currency,
    trim(p_client_request_id),
    v_confirmation,
    'completed'
  )
  returning id into v_redemption_id;

  v_need := v_debit;
  for v_lot in
    select *
    from public.credit_lots
    where wallet_id = v_wallet.id
      and status = 'available'
      and remaining_amount_cents > 0
    order by available_at asc, created_at asc, id asc
    for update
  loop
    exit when v_need <= 0;
    v_take := least(v_lot.remaining_amount_cents, v_need);

    update public.credit_lots
    set remaining_amount_cents = remaining_amount_cents - v_take,
        status = case
          when remaining_amount_cents - v_take = 0 then 'exhausted'
          else status
        end
    where id = v_lot.id;

    insert into public.credit_consumptions (
      balance_redemption_id, credit_lot_id, amount_cents
    ) values (
      v_redemption_id, v_lot.id, v_take
    );

    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    raise exception 'Insufficient credit lots for debit (invariant failure)';
  end if;

  update public.wallets
  set balance_cents = balance_cents - v_debit,
      version = version + 1
  where id = v_wallet.id;

  v_liability := app_private.get_or_create_customer_liability(v_uid);
  v_merchant_payable := app_private.get_or_create_merchant_payable(v_merchant.id);
  v_fee_rev := app_private.platform_account_id('merchant_fee_revenue');

  if v_fee > 0 then
    v_entries := jsonb_build_array(
      jsonb_build_object('financial_account_id', v_liability, 'amount_cents', -v_debit),
      jsonb_build_object('financial_account_id', v_merchant_payable, 'amount_cents', v_payable),
      jsonb_build_object('financial_account_id', v_fee_rev, 'amount_cents', v_fee)
    );
  else
    v_entries := jsonb_build_array(
      jsonb_build_object('financial_account_id', v_liability, 'amount_cents', -v_debit),
      jsonb_build_object('financial_account_id', v_merchant_payable, 'amount_cents', v_payable)
    );
  end if;

  perform app_private.post_ledger_transaction(
    'balance_redemption',
    'balance_redemption',
    v_redemption_id,
    'redeem:' || v_redemption_id::text,
    v_entries
  );

  return jsonb_build_object(
    'id', v_redemption_id,
    'confirmation_code', v_confirmation,
    'merchant_display_name', v_merchant.display_name,
    'subtotal_cents', p_subtotal_cents,
    'tip_cents', p_tip_cents,
    'balance_debited_cents', v_debit,
    'merchant_fee_bps', v_fee_bps,
    'merchant_fee_cents', v_fee,
    'merchant_payable_cents', v_payable,
    'currency', v_cfg.currency,
    'status', 'completed',
    'idempotent', false
  );
exception
  when unique_violation then
    select * into v_existing
    from public.balance_redemptions
    where customer_user_id = v_uid
      and client_request_id = p_client_request_id;
    if found then
      return jsonb_build_object(
        'id', v_existing.id,
        'confirmation_code', v_existing.confirmation_code,
        'subtotal_cents', v_existing.subtotal_cents,
        'tip_cents', v_existing.tip_cents,
        'balance_debited_cents', v_existing.balance_debited_cents,
        'merchant_fee_cents', v_existing.merchant_fee_cents,
        'merchant_payable_cents', v_existing.merchant_payable_cents,
        'currency', v_existing.currency,
        'status', v_existing.status,
        'idempotent', true
      );
    end if;
    raise;
end;
$$;

revoke all on function app_private.issue_balance_purchase(uuid, text, text) from public;
revoke all on function app_private.rotate_gift_claim_token(uuid, text) from public;
revoke all on function app_private.claim_pending_gift(text, uuid) from public;
revoke all on function public.redeem_lokala_balance(text, bigint, bigint, text) from public;

grant execute on function app_private.issue_balance_purchase(uuid, text, text) to service_role;
grant execute on function app_private.rotate_gift_claim_token(uuid, text) to service_role;
grant execute on function app_private.claim_pending_gift(text, uuid) to service_role;
grant execute on function public.redeem_lokala_balance(text, bigint, bigint, text) to authenticated;
