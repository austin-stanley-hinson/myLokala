-- Part 3 of the guardrails checkpoint: refund path for a balance purchase
-- (self-top-up or an as-yet-unclaimed gift). Full refund only -- there is no
-- partial-amount parameter. Explicitly out of scope, per the checkpoint:
-- clawing back an already-claimed or already-spent gift. If any of the
-- purchase's credit_lot has already been consumed, this refuses with a clear
-- error rather than attempting a partial reversal -- a known, accepted gap
-- for this checkpoint, not something this migration works around.
--
-- Mirrors app_private.issue_balance_purchase's two delivery shapes exactly,
-- in reverse:
--   'delivered' (self-top-up, or a gift to an already-known recipient): a
--     credit_lots row exists. Refundable only while status='available' and
--     remaining_amount_cents = original_amount_cents (nothing spent). The
--     lot is marked 'reversed' and the wallet is debited by face_value_cents.
--   'pending_claim' (gift to an unknown recipient, not yet claimed): no
--     credit_lot exists yet, so nothing to check for spend -- unclaimed is
--     always unspent by construction. The outstanding app_private.gift_claims
--     row is canceled so it can never be claimed after the refund.
-- Both reverse the exact ledger entries issue_balance_purchase posted
-- (customer_liability or unclaimed_gift_liability, customer_fee_revenue,
-- stripe_platform_clearing), negated, via the same balanced
-- post_ledger_transaction primitive -- never a bespoke entry shape.
--
-- Split into two functions the same way issue_balance_purchase and the TS
-- balance-purchase route already split reads from the atomic write: the
-- caller (src/lib/payments/refund-balance-purchase.ts) does its ownership /
-- status / "already spent" checks via plain reads BEFORE ever calling
-- Stripe, then calls Stripe, then calls finalize_balance_purchase_refund to
-- atomically reverse the ledger/wallet/gift-claim and record the refund.
-- finalize re-validates everything itself under a fresh row lock rather than
-- trusting the pre-check -- the same discipline redeem_lokala_balance and
-- issue_balance_purchase already use -- so a race in the gap between the
-- pre-check and the Stripe call can never corrupt the ledger; it can only
-- make finalize raise, which the caller logs loudly (money already left
-- Stripe by that point) rather than silently swallow.
create or replace function app_private.finalize_balance_purchase_refund(
  p_balance_purchase_id uuid,
  p_stripe_refund_id text,
  p_amount_cents bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, extensions, pg_temp
as $$
declare
  v_purchase public.balance_purchases%rowtype;
  v_order public.payment_orders%rowtype;
  v_lot public.credit_lots%rowtype;
  v_clearing uuid;
  v_fee_rev uuid;
  v_liability uuid;
  v_entries jsonb;
  v_refund_id uuid;
  v_existing app_private.refunds%rowtype;
begin
  perform app_private.assert_service_role();

  select * into v_purchase
  from public.balance_purchases
  where id = p_balance_purchase_id
  for update;

  if not found then
    raise exception 'balance_purchase not found';
  end if;

  if p_amount_cents <> v_purchase.total_paid_cents then
    raise exception 'refund amount % does not match total_paid_cents %',
      p_amount_cents, v_purchase.total_paid_cents;
  end if;

  select * into v_order
  from public.payment_orders
  where id = v_purchase.payment_order_id
  for update;

  if not found then
    raise exception 'payment_order not found';
  end if;

  -- Idempotent replay: already finalized (by this call or an earlier one
  -- that landed after the caller's own request timed out).
  if v_purchase.status = 'refunded' then
    select * into v_existing
    from app_private.refunds
    where balance_purchase_id = v_purchase.id
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'status', 'refunded',
      'idempotent', true,
      'refund_id', v_existing.id,
      'stripe_refund_id', v_existing.stripe_refund_id
    );
  end if;

  if v_purchase.status not in ('delivered', 'pending_claim') then
    raise exception 'balance_purchase status % is not refundable', v_purchase.status;
  end if;

  v_clearing := app_private.platform_account_id('stripe_platform_clearing');
  v_fee_rev := app_private.platform_account_id('customer_fee_revenue');

  if v_purchase.status = 'delivered' then
    select * into v_lot
    from public.credit_lots
    where balance_purchase_id = v_purchase.id
    for update;

    if not found then
      raise exception 'expected a credit_lot for delivered balance_purchase %, found none', v_purchase.id;
    end if;

    if v_lot.status <> 'available' or v_lot.remaining_amount_cents <> v_lot.original_amount_cents then
      raise exception 'balance has already been partially or fully spent -- not refundable';
    end if;

    v_liability := app_private.get_or_create_customer_liability(v_purchase.recipient_user_id);

    update public.credit_lots
    set status = 'reversed', remaining_amount_cents = 0
    where id = v_lot.id;

    update public.wallets
    set balance_cents = balance_cents - v_purchase.face_value_cents,
        version = version + 1
    where id = v_lot.wallet_id;
  else
    -- pending_claim: no credit_lot exists yet. Cancel the outstanding claim
    -- so it can never be claimed after this refund lands.
    v_liability := app_private.platform_account_id('unclaimed_gift_liability');

    update app_private.gift_claims
    set status = 'canceled'
    where balance_purchase_id = v_purchase.id
      and status = 'pending';
  end if;

  if v_purchase.customer_fee_cents > 0 then
    v_entries := jsonb_build_array(
      jsonb_build_object('financial_account_id', v_liability, 'amount_cents', -v_purchase.face_value_cents),
      jsonb_build_object('financial_account_id', v_fee_rev, 'amount_cents', -v_purchase.customer_fee_cents),
      jsonb_build_object('financial_account_id', v_clearing, 'amount_cents', v_purchase.total_paid_cents)
    );
  else
    v_entries := jsonb_build_array(
      jsonb_build_object('financial_account_id', v_liability, 'amount_cents', -v_purchase.face_value_cents),
      jsonb_build_object('financial_account_id', v_clearing, 'amount_cents', v_purchase.total_paid_cents)
    );
  end if;

  perform app_private.post_ledger_transaction(
    'balance_purchase_refund',
    'balance_purchase',
    v_purchase.id,
    'refund:' || v_purchase.id::text,
    v_entries
  );

  update public.balance_purchases
  set status = 'refunded'
  where id = v_purchase.id;

  update public.payment_orders
  set status = 'refunded'
  where id = v_order.id;

  insert into app_private.refunds (
    payment_order_id, balance_purchase_id, stripe_refund_id, amount_cents, currency, status, reason
  ) values (
    v_order.id, v_purchase.id, p_stripe_refund_id, p_amount_cents, v_purchase.currency, 'succeeded', p_reason
  )
  on conflict (stripe_refund_id) do nothing
  returning id into v_refund_id;

  if v_refund_id is null then
    select id into v_refund_id from app_private.refunds where stripe_refund_id = p_stripe_refund_id;
  end if;

  return jsonb_build_object(
    'status', 'refunded',
    'idempotent', false,
    'refund_id', v_refund_id,
    'stripe_refund_id', p_stripe_refund_id
  );
end;
$$;

revoke all on function app_private.finalize_balance_purchase_refund(uuid, text, bigint, text) from public;
grant execute on function app_private.finalize_balance_purchase_refund(uuid, text, bigint, text) to service_role;

create or replace function public.service_finalize_balance_purchase_refund(
  p_balance_purchase_id uuid,
  p_stripe_refund_id text,
  p_amount_cents bigint,
  p_reason text default null
)
returns jsonb
language sql
security definer
set search_path = app_private, public, pg_temp
as $$
  select app_private.finalize_balance_purchase_refund(
    p_balance_purchase_id, p_stripe_refund_id, p_amount_cents, p_reason
  );
$$;

revoke all on function public.service_finalize_balance_purchase_refund(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.service_finalize_balance_purchase_refund(uuid, text, bigint, text)
  to service_role;
