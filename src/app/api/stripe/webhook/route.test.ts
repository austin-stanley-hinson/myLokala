/**
 * Legacy platform PaymentIntent webhook: static source checks. Run with `npm test`.
 *
 * This route imports next/server-adjacent modules via `@/lib/...` aliases and
 * calls createAdminClient()/getStripe() at module scope, so it cannot be
 * imported and invoked directly under the plain Node test runner (no path-alias
 * resolver, no live Supabase/Stripe). The behavioral guarantee that a
 * balance-purchase event triggers service_issue_balance_purchase exactly once,
 * even on retry, is proven directly against the injectable
 * handleBalancePurchasePaymentIntentEvent in balance-purchase-webhook.test.ts.
 *
 * What's checked here, source-inspection style (same technique already used
 * by gift-metadata.test.ts for the read-only confirm route), is narrower and
 * complementary: that the new balance-purchase branch is positioned to
 * intercept before the legacy payment_transactions lookup, and that the
 * legacy gift-certificate code path this route also handles is textually
 * untouched.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const routePath = join(dirname(fileURLToPath(import.meta.url)), "route.ts");
const source = readFileSync(routePath, "utf8");

describe("POST /api/stripe/webhook: balance-purchase dispatch", () => {
  it("routes balance_purchase PaymentIntents before the legacy payment_transactions lookup", () => {
    const dispatchIndex = source.indexOf('intent.metadata?.kind === "balance_purchase"');
    const legacyLookupIndex = source.indexOf("findTransactionForIntent(admin, intent)");

    assert.notEqual(dispatchIndex, -1, "balance_purchase dispatch check is present");
    assert.notEqual(legacyLookupIndex, -1, "legacy payment_transactions lookup is present");
    assert.ok(
      dispatchIndex < legacyLookupIndex,
      "the balance_purchase branch must return before the legacy lookup ever runs",
    );
  });

  it("still calls the legacy gift-certificate delivery RPC unchanged", () => {
    assert.match(source, /admin\.rpc\("deliver_gift_certificate"/);
  });

  it("does not touch payment_transactions from the new balance-purchase branch", () => {
    // The dispatch block itself (between the two markers below) must not
    // reference payment_transactions -- that table belongs to the legacy path.
    const start = source.indexOf('intent.metadata?.kind === "balance_purchase"');
    const end = source.indexOf("try {\n    const transaction = await findTransactionForIntent");
    assert.ok(start !== -1 && end !== -1 && start < end);
    const dispatchBlock = source.slice(start, end);
    assert.equal(dispatchBlock.includes("payment_transactions"), false);
  });
});
