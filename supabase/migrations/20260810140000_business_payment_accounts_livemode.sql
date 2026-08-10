-- Distinguish test vs live Stripe Connect accounts on business_payment_accounts.
--
-- When the platform switches from sk_test to sk_live, existing TEST acct_... ids
-- must not be reused or retrieved with live credentials. livemode records which
-- Stripe mode the current stripe_account_id belongs to; previous_stripe_account_id
-- preserves the prior id when a merchant is forced to create a same-owner account
-- in the new mode.

alter table public.business_payment_accounts
  add column if not exists livemode boolean,
  add column if not exists previous_stripe_account_id text;

comment on column public.business_payment_accounts.livemode is
  'Stripe Account.livemode for stripe_account_id. Null = legacy row from before this discriminator (treated as test-era).';

comment on column public.business_payment_accounts.previous_stripe_account_id is
  'Prior connected account id retained when replacing a wrong-mode acct_... during test→live (or reverse) cutover.';

-- Lookups by connected account id (Connect webhook) stay indexed via the
-- existing unique stripe_account_id constraint.
create index if not exists business_payment_accounts_livemode_idx
  on public.business_payment_accounts (livemode)
  where stripe_account_id is not null;
