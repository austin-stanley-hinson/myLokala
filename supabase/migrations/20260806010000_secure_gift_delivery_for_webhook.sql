-- Make the verified Stripe webhook the only path that can issue Lokala credit.
--
-- deliver_gift_certificate() performs no Stripe verification of its own -- it
-- trusts its caller to have confirmed the payment. It was granted to `anon` and
-- `authenticated` so the browser confirm route could call it, which meant any
-- caller who knew or guessed a pending PaymentIntent id could mint credit
-- without a payment ever succeeding. The migration that introduced it flagged
-- this as a test-mode limitation to fix before go-live; this is that fix.
--
-- After this migration the function is reachable only by `service_role`, which
-- is used exclusively by trusted server code (the signed webhook handler). The
-- browser confirm route is reduced to reporting status and can no longer move
-- money.
--
-- claim_pending_gift_certificates() deliberately keeps its `authenticated`
-- grant: it only delivers certificates already in status 'paid', and only the
-- webhook can set that status, so a signed-in user claiming their own gift
-- cannot create credit that was not paid for.

revoke execute on function public.deliver_gift_certificate(text) from anon;
revoke execute on function public.deliver_gift_certificate(text) from authenticated;

-- Explicit grant so the webhook handler keeps working regardless of any
-- default-privilege changes.
grant execute on function public.deliver_gift_certificate(text) to service_role;

-- Webhook plumbing is server-only; make sure the ledger tables are never
-- reachable through the anon or authenticated API roles for writes. (RLS
-- already denies writes; this removes the table privileges as well, so a future
-- permissive policy cannot accidentally open a write path.)
revoke insert, update, delete on public.payment_transactions from anon;
revoke insert, update, delete on public.payment_transactions from authenticated;
revoke all on public.stripe_webhook_events from anon;
revoke all on public.stripe_webhook_events from authenticated;
