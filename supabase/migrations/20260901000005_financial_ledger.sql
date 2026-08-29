-- Double-entry financial ledger (private schema — not Data API exposed).

create table app_private.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in (
    'customer_gift_liability',
    'unclaimed_gift_liability',
    'merchant_payable',
    'stripe_platform_clearing',
    'customer_fee_revenue',
    'merchant_fee_revenue',
    'processing_fee_expense',
    'refund_dispute_reserve'
  )),
  owner_profile_id uuid references public.profiles (id) on delete restrict,
  owner_merchant_account_id uuid references public.merchant_accounts (id) on delete restrict,
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'active'
    check (status in ('active', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (
      account_type in ('customer_gift_liability')
      and owner_profile_id is not null
      and owner_merchant_account_id is null
    )
    or (
      account_type in ('unclaimed_gift_liability', 'stripe_platform_clearing',
                       'customer_fee_revenue', 'merchant_fee_revenue',
                       'processing_fee_expense', 'refund_dispute_reserve')
      and owner_profile_id is null
      and owner_merchant_account_id is null
    )
    or (
      account_type = 'merchant_payable'
      and owner_merchant_account_id is not null
      and owner_profile_id is null
    )
  )
);

-- One liability account per customer currency
create unique index financial_accounts_customer_liability_uidx
  on app_private.financial_accounts (owner_profile_id, currency)
  where account_type = 'customer_gift_liability';

create unique index financial_accounts_merchant_payable_uidx
  on app_private.financial_accounts (owner_merchant_account_id, currency)
  where account_type = 'merchant_payable';

-- Singleton platform accounts per type+currency
create unique index financial_accounts_platform_singleton_uidx
  on app_private.financial_accounts (account_type, currency)
  where owner_profile_id is null and owner_merchant_account_id is null;

create table app_private.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null,
  reference_type text not null,
  reference_id uuid not null,
  idempotency_key text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'reversed')),
  reverses_transaction_id uuid references app_private.ledger_transactions (id),
  created_at timestamptz not null default timezone('utc', now()),
  posted_at timestamptz,
  check (
    (status = 'posted' and posted_at is not null)
    or (status <> 'posted')
  )
  -- reverses_transaction_id is set on the correcting transaction that points
  -- at the original; the original is marked status = 'reversed'.
);

create index ledger_transactions_reference_idx
  on app_private.ledger_transactions (reference_type, reference_id);

create table app_private.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  ledger_transaction_id uuid not null
    references app_private.ledger_transactions (id) on delete restrict,
  financial_account_id uuid not null
    references app_private.financial_accounts (id) on delete restrict,
  amount_cents bigint not null check (amount_cents <> 0),
  currency text not null default 'USD' check (currency = 'USD'),
  created_at timestamptz not null default timezone('utc', now())
);

create index ledger_entries_txn_idx
  on app_private.ledger_entries (ledger_transaction_id);

create index ledger_entries_account_idx
  on app_private.ledger_entries (financial_account_id);

-- Immutability for posted ledger
create or replace function app_private.guard_ledger_transaction_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'posted' then
    -- Allow only draft -> posted or posted -> reversed via trusted helpers setting status
    if new.status = old.status
       and new.transaction_type = old.transaction_type
       and new.reference_type = old.reference_type
       and new.reference_id = old.reference_id
       and new.idempotency_key = old.idempotency_key
       and new.reverses_transaction_id is not distinct from old.reverses_transaction_id
       and new.posted_at is not distinct from old.posted_at
       and new.created_at = old.created_at then
      return new;
    end if;
    if not (old.status = 'posted' and new.status = 'reversed') then
      raise exception 'Posted ledger transactions cannot be mutated'
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger ledger_transactions_guard_update
  before update on app_private.ledger_transactions
  for each row execute function app_private.guard_ledger_transaction_update();

create trigger ledger_transactions_forbid_delete
  before delete on app_private.ledger_transactions
  for each row execute function public.forbid_hard_delete();

create or replace function app_private.guard_ledger_entry_mutation()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from app_private.ledger_transactions
  where id = coalesce(new.ledger_transaction_id, old.ledger_transaction_id);

  if v_status = 'posted' then
    raise exception 'Posted ledger entries cannot be mutated or deleted'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger ledger_entries_guard_update
  before update on app_private.ledger_entries
  for each row execute function app_private.guard_ledger_entry_mutation();

create trigger ledger_entries_guard_delete
  before delete on app_private.ledger_entries
  for each row execute function app_private.guard_ledger_entry_mutation();

-- Ensure singleton platform accounts exist
insert into app_private.financial_accounts (account_type, currency)
values
  ('unclaimed_gift_liability', 'USD'),
  ('stripe_platform_clearing', 'USD'),
  ('customer_fee_revenue', 'USD'),
  ('merchant_fee_revenue', 'USD'),
  ('processing_fee_expense', 'USD'),
  ('refund_dispute_reserve', 'USD');

-- Helpers to get-or-create owner accounts
create or replace function app_private.get_or_create_customer_liability(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from app_private.financial_accounts
  where account_type = 'customer_gift_liability'
    and owner_profile_id = p_profile_id
    and currency = 'USD';

  if v_id is not null then
    return v_id;
  end if;

  insert into app_private.financial_accounts (
    account_type, owner_profile_id, currency
  ) values (
    'customer_gift_liability', p_profile_id, 'USD'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function app_private.get_or_create_merchant_payable(p_merchant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from app_private.financial_accounts
  where account_type = 'merchant_payable'
    and owner_merchant_account_id = p_merchant_id
    and currency = 'USD';

  if v_id is not null then
    return v_id;
  end if;

  insert into app_private.financial_accounts (
    account_type, owner_merchant_account_id, currency
  ) values (
    'merchant_payable', p_merchant_id, 'USD'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function app_private.platform_account_id(p_type text)
returns uuid
language sql
stable
security definer
set search_path = app_private, pg_temp
as $$
  select id
  from app_private.financial_accounts
  where account_type = p_type
    and currency = 'USD'
    and owner_profile_id is null
    and owner_merchant_account_id is null
  limit 1;
$$;

-- Post a balanced draft ledger transaction
create or replace function app_private.post_ledger_transaction(
  p_transaction_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_idempotency_key text,
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_existing uuid;
  v_txn_id uuid;
  v_entry jsonb;
  v_sum bigint := 0;
  v_amount bigint;
begin
  select id into v_existing
  from app_private.ledger_transactions
  where idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'Ledger transaction requires at least two entries';
  end if;

  insert into app_private.ledger_transactions (
    transaction_type,
    reference_type,
    reference_id,
    idempotency_key,
    status,
    posted_at
  ) values (
    p_transaction_type,
    p_reference_type,
    p_reference_id,
    p_idempotency_key,
    'draft',
    null
  )
  returning id into v_txn_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_amount := (v_entry ->> 'amount_cents')::bigint;
    if v_amount = 0 then
      raise exception 'Ledger entry amount cannot be zero';
    end if;
    v_sum := v_sum + v_amount;

    insert into app_private.ledger_entries (
      ledger_transaction_id,
      financial_account_id,
      amount_cents,
      currency
    ) values (
      v_txn_id,
      (v_entry ->> 'financial_account_id')::uuid,
      v_amount,
      coalesce(v_entry ->> 'currency', 'USD')
    );
  end loop;

  if v_sum <> 0 then
    raise exception 'Ledger transaction is unbalanced: sum=%', v_sum;
  end if;

  update app_private.ledger_transactions
  set status = 'posted',
      posted_at = timezone('utc', now())
  where id = v_txn_id;

  return v_txn_id;
exception
  when unique_violation then
    select id into v_existing
    from app_private.ledger_transactions
    where idempotency_key = p_idempotency_key;
    return v_existing;
end;
$$;

revoke all on function app_private.post_ledger_transaction(text, text, uuid, text, jsonb) from public;
revoke all on function app_private.get_or_create_customer_liability(uuid) from public;
revoke all on function app_private.get_or_create_merchant_payable(uuid) from public;
revoke all on function app_private.platform_account_id(text) from public;
grant execute on function app_private.post_ledger_transaction(text, text, uuid, text, jsonb) to service_role;
grant execute on function app_private.get_or_create_customer_liability(uuid) to service_role;
grant execute on function app_private.get_or_create_merchant_payable(uuid) to service_role;
grant execute on function app_private.platform_account_id(text) to service_role;
