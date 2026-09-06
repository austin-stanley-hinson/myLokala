-- Purchaser-facing gift notifications, part 1: read path for the live claim
-- expiry window, and widening expire_pending_gift_claims's return shape so a
-- future scheduled caller (separate checkpoint -- no pg_cron here) can email
-- each affected purchaser without another migration.
--
-- ---------------------------------------------------------------------------
-- 1. Service-only: live claim expiry window.
--
-- gift-claim-email.ts (the recipient's claim-link email) still mirrors
-- expiry_days as a display constant -- see that module's docstring. The new
-- purchaser-facing "gift sent" confirmation must state the real configured
-- window instead of a value that could silently drift, so it needs an actual
-- read path. Mirrors service_get_platform_stripe_livemode
-- (20260901000013_stripe_connect_onboarding.sql) exactly: SECURITY DEFINER,
-- pinned search_path, execute revoked from public/anon/authenticated and
-- granted only to service_role.
-- ---------------------------------------------------------------------------
create or replace function public.service_get_gift_claim_expiry_days()
returns integer
language plpgsql
stable
security definer
set search_path = app_private, pg_temp
as $$
declare
  v_days integer;
begin
  select expiry_days into v_days
  from app_private.platform_config
  where id = 'mvp';

  if v_days is null then
    raise exception 'Platform is not configured';
  end if;

  return v_days;
end;
$$;

revoke all on function public.service_get_gift_claim_expiry_days() from public, anon, authenticated;
grant execute on function public.service_get_gift_claim_expiry_days() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Widen app_private.expire_pending_gift_claims's return shape.
--
-- Previously returned only {expired_count, skipped_no_wallet_count}. Adds
-- expired_rows: a jsonb array of {id, purchaser_user_id, recipient_email,
-- amount_cents}, one entry per claim where money actually moved back to the
-- purchaser this run -- so a future scheduled caller can loop through and
-- send each purchaser a "your gift expired and was returned" email without
-- re-querying gift_claims itself. Deliberately excludes the "already moved on
-- through another path" branch (purchase not found / not pending_claim): no
-- reversal happened there, so there is nothing to notify a purchaser about.
--
-- No email-sending logic and no pg_cron scheduling added here -- both are a
-- separate checkpoint, per the task this migration was written for. The
-- reversal algorithm itself is unchanged from 20260901000015; only the
-- returned shape differs.
-- ---------------------------------------------------------------------------
create or replace function app_private.expire_pending_gift_claims()
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, extensions, pg_temp
as $$
declare
  v_cfg app_private.platform_config%rowtype;
  v_claim app_private.gift_claims%rowtype;
  v_purchase public.balance_purchases%rowtype;
  v_wallet public.wallets%rowtype;
  v_lot_id uuid;
  v_unclaimed uuid;
  v_liability uuid;
  v_expired_count integer := 0;
  v_skipped_no_wallet_count integer := 0;
  v_expired_rows jsonb := '[]'::jsonb;
begin
  perform app_private.assert_service_role();

  select * into v_cfg from app_private.platform_config where id = 'mvp' for share;

  for v_claim in
    select *
    from app_private.gift_claims
    where status = 'pending'
      and created_at <= timezone('utc', now()) - make_interval(days => v_cfg.expiry_days)
    order by created_at asc
    for update
  loop
    select * into v_purchase
    from public.balance_purchases
    where id = v_claim.balance_purchase_id
    for update;

    if not found or v_purchase.status <> 'pending_claim' then
      -- Already claimed, canceled, or otherwise moved on through another
      -- path. Mark the claim expired so it is never reprocessed, but never
      -- move money for a purchase this function does not recognize as still
      -- outstanding, and never report it as a reversal (nothing to notify a
      -- purchaser about).
      update app_private.gift_claims
      set status = 'expired'
      where id = v_claim.id;
      v_expired_count := v_expired_count + 1;
      continue;
    end if;

    select * into v_wallet
    from public.wallets
    where user_id = v_purchase.purchaser_user_id
      and currency = v_purchase.currency
    for update;

    if not found or v_wallet.status <> 'active' then
      -- Purchaser has no usable wallet right now (missing or frozen/closed).
      -- Leave this claim pending so a later run can retry once it is active.
      v_skipped_no_wallet_count := v_skipped_no_wallet_count + 1;
      continue;
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

    if v_lot_id is not null then
      -- Reversing the purchaser's own money can legitimately push them over
      -- max_wallet_balance_cents; that cap only bounds a fresh credit
      -- (issue_balance_purchase / claim_pending_gift), not money coming back.
      update public.wallets
      set balance_cents = balance_cents + v_purchase.face_value_cents,
          version = version + 1
      where id = v_wallet.id;

      v_unclaimed := app_private.platform_account_id('unclaimed_gift_liability');
      v_liability := app_private.get_or_create_customer_liability(v_purchase.purchaser_user_id);

      perform app_private.post_ledger_transaction(
        'gift_expiry_reversal',
        'balance_purchase',
        v_purchase.id,
        'expire:' || v_purchase.id::text,
        jsonb_build_array(
          jsonb_build_object(
            'financial_account_id', v_unclaimed,
            'amount_cents', -v_purchase.face_value_cents
          ),
          jsonb_build_object(
            'financial_account_id', v_liability,
            'amount_cents', v_purchase.face_value_cents
          )
        )
      );
    end if;

    -- v_lot_id is null only via the on-conflict guard (a credit lot for this
    -- purchase/wallet pair already exists, e.g. an interrupted earlier run) --
    -- the purchaser's money already moved either way, so this is still
    -- reported as a reversal.
    v_expired_rows := v_expired_rows || jsonb_build_array(
      jsonb_build_object(
        'id', v_claim.id,
        'purchaser_user_id', v_purchase.purchaser_user_id,
        'recipient_email', v_claim.recipient_email_normalized,
        'amount_cents', v_purchase.face_value_cents
      )
    );

    update app_private.gift_claims
    set status = 'expired'
    where id = v_claim.id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return jsonb_build_object(
    'expired_count', v_expired_count,
    'skipped_no_wallet_count', v_skipped_no_wallet_count,
    'expired_rows', v_expired_rows
  );
end;
$$;

revoke all on function app_private.expire_pending_gift_claims() from public;
grant execute on function app_private.expire_pending_gift_claims() to service_role;

comment on function app_private.expire_pending_gift_claims() is
  'Reverses past-window pending gift claims to the original purchaser''s wallet, returning the reversed rows for a future scheduled emailer. Not scheduled (no pg_cron call) -- run manually or wire a schedule in a later checkpoint.';
