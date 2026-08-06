-- Refund identifiers on the payment ledger.
--
-- payment_transactions already tracks refunded amounts (refund_status,
-- refunded_cents, application_fee_refunded_cents, refunded_at). These columns
-- add the Stripe-side identifiers and the caller-supplied request id, so a
-- refund can be traced end to end and a retried refund request is recognizable.
--
-- Additive and nullable: existing rows stay valid with no backfill.

alter table public.payment_transactions
  -- Most recent Stripe refund for this payment. Partial refunds accumulate in
  -- refunded_cents; this records the identifier of the latest one.
  add column if not exists stripe_refund_id text,
  -- The caller's idempotency token for the latest refund request. Also used to
  -- derive the deterministic Stripe idempotency key, so replaying the same
  -- request cannot refund twice.
  add column if not exists last_refund_request_id uuid,
  -- Free-text reason recorded for operator context. Never returned to a customer.
  add column if not exists refund_reason text;

-- Lets the refund path detect a replay of the same request cheaply.
create index if not exists payment_transactions_last_refund_request_idx
  on public.payment_transactions (last_refund_request_id)
  where last_refund_request_id is not null;
