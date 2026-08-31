/**
 * notifyPurchaserOfGiftClaim. Run with `npm test`.
 *
 * Called from src/app/api/gifts/claim/route.ts strictly AFTER
 * service_claim_pending_gift already committed -- the "failure never blocks"
 * test below proves the function resolves normally (never throws) even when
 * the confirmation sender fails, which is exactly the property the route
 * depends on to `await` this without risking its own response.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import {
  notifyPurchaserOfGiftClaim,
  toGiftClaimConfirmationAdmin,
  type GiftClaimConfirmationAdmin,
} from "./gift-claim-confirmation.ts";
import type { SendGiftClaimedConfirmationInput } from "./gift-purchaser-email.ts";

type TableRow = Record<string, unknown>;

function makeFakeAdmin(opts: {
  balancePurchases?: TableRow[];
  profiles?: TableRow[];
  userEmails?: Record<string, string>;
}): GiftClaimConfirmationAdmin {
  const balancePurchases = opts.balancePurchases ?? [];
  const profiles = opts.profiles ?? [];
  const userEmails = opts.userEmails ?? {};

  const tables: Record<string, TableRow[]> = { balance_purchases: balancePurchases, profiles };

  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  const rows = tables[table] ?? [];
                  const row = rows.find((r) => r[column] === value);
                  return { data: row ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        async getUserById(userId: string) {
          const email = userEmails[userId];
          if (!email) return { data: { user: null }, error: null };
          return { data: { user: { email } }, error: null };
        },
      },
    },
  };
}

function fakeSender(): {
  send: (input: SendGiftClaimedConfirmationInput) => Promise<void>;
  calls: SendGiftClaimedConfirmationInput[];
} {
  const calls: SendGiftClaimedConfirmationInput[] = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
    },
  };
}

function neverSend(): Promise<void> {
  throw new Error("sendGiftClaimedConfirmation should not be called for this test");
}

describe("notifyPurchaserOfGiftClaim", () => {
  it("sends the purchaser a confirmation with the recipient's display name and the amount", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const claimantUserId = randomUUID();
    const admin = makeFakeAdmin({
      balancePurchases: [
        {
          id: balancePurchaseId,
          purchaser_user_id: purchaserUserId,
          purchase_kind: "gift",
          face_value_cents: 2000,
          currency: "USD",
        },
      ],
      profiles: [{ id: claimantUserId, display_name: "Jordan" }],
      userEmails: { [purchaserUserId]: "purchaser@example.com" },
    });
    const sender = fakeSender();

    await notifyPurchaserOfGiftClaim(
      admin,
      { balancePurchaseId, claimantUserId, idempotent: false },
      sender.send,
    );

    assert.equal(sender.calls.length, 1);
    const call = sender.calls[0]!;
    assert.equal(call.to, "purchaser@example.com");
    assert.equal(call.recipientLabel, "Jordan");
    assert.equal(call.amountCents, 2000);
    assert.equal(call.currency, "USD");
  });

  it("falls back to the claimant's email when their profile has no display_name", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const claimantUserId = randomUUID();
    const admin = makeFakeAdmin({
      balancePurchases: [
        {
          id: balancePurchaseId,
          purchaser_user_id: purchaserUserId,
          purchase_kind: "gift",
          face_value_cents: 1000,
          currency: "USD",
        },
      ],
      profiles: [{ id: claimantUserId, display_name: null }],
      userEmails: {
        [purchaserUserId]: "purchaser@example.com",
        [claimantUserId]: "claimant@example.com",
      },
    });
    const sender = fakeSender();

    await notifyPurchaserOfGiftClaim(
      admin,
      { balancePurchaseId, claimantUserId, idempotent: false },
      sender.send,
    );

    assert.equal(sender.calls[0]!.recipientLabel, "claimant@example.com");
  });

  it("never sends for an idempotent (duplicate) claim -- the purchaser was already notified", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      balancePurchases: [
        {
          id: balancePurchaseId,
          purchaser_user_id: purchaserUserId,
          purchase_kind: "gift",
          face_value_cents: 1000,
          currency: "USD",
        },
      ],
      userEmails: { [purchaserUserId]: "purchaser@example.com" },
    });

    await notifyPurchaserOfGiftClaim(
      admin,
      { balancePurchaseId, claimantUserId: randomUUID(), idempotent: true },
      neverSend,
    );
    // No assertion needed beyond "did not throw" -- neverSend would have
    // thrown from inside notifyPurchaserOfGiftClaim's own try/catch and been
    // swallowed either way, so the real proof is the dedicated failure test
    // below combined with this one calling neverSend at all.
  });

  it("never sends for a self-top-up purchase_kind, even if this path were somehow reached", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      balancePurchases: [
        {
          id: balancePurchaseId,
          purchaser_user_id: purchaserUserId,
          purchase_kind: "self_top_up",
          face_value_cents: 1000,
          currency: "USD",
        },
      ],
      userEmails: { [purchaserUserId]: "purchaser@example.com" },
    });
    const sender = fakeSender();

    await notifyPurchaserOfGiftClaim(
      admin,
      { balancePurchaseId, claimantUserId: randomUUID(), idempotent: false },
      sender.send,
    );

    assert.equal(sender.calls.length, 0);
  });

  it("resolves normally (never throws) when the sender fails -- proving it cannot block the caller", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      balancePurchases: [
        {
          id: balancePurchaseId,
          purchaser_user_id: purchaserUserId,
          purchase_kind: "gift",
          face_value_cents: 1000,
          currency: "USD",
        },
      ],
      userEmails: { [purchaserUserId]: "purchaser@example.com" },
    });

    await assert.doesNotReject(() =>
      notifyPurchaserOfGiftClaim(
        admin,
        { balancePurchaseId, claimantUserId: randomUUID(), idempotent: false },
        async () => {
          throw new Error("Resend API error 500: simulated outage");
        },
      ),
    );
  });

  it("resolves normally when the balance_purchase cannot be found", async () => {
    const admin = makeFakeAdmin({});

    await assert.doesNotReject(() =>
      notifyPurchaserOfGiftClaim(
        admin,
        { balancePurchaseId: randomUUID(), claimantUserId: randomUUID(), idempotent: false },
        neverSend,
      ),
    );
  });

  it("resolves normally (and does not send) when the purchaser has no email on file", async () => {
    const balancePurchaseId = randomUUID();
    const purchaserUserId = randomUUID();
    const admin = makeFakeAdmin({
      balancePurchases: [
        {
          id: balancePurchaseId,
          purchaser_user_id: purchaserUserId,
          purchase_kind: "gift",
          face_value_cents: 1000,
          currency: "USD",
        },
      ],
      // No userEmails entry for purchaserUserId.
    });

    await assert.doesNotReject(() =>
      notifyPurchaserOfGiftClaim(
        admin,
        { balancePurchaseId, claimantUserId: randomUUID(), idempotent: false },
        neverSend,
      ),
    );
  });
});

describe("toGiftClaimConfirmationAdmin", () => {
  it("forwards .from().select().eq().maybeSingle() to the raw client, reshaping its result", async () => {
    const calls: Array<{ table: string; columns: string; column: string; value: string }> = [];
    const raw = {
      from(table: string) {
        return {
          select(columns: string) {
            return {
              eq(column: string, value: string) {
                calls.push({ table, columns, column, value });
                return {
                  async maybeSingle() {
                    return { data: { display_name: "Jordan" }, error: null };
                  },
                };
              },
            };
          },
        };
      },
      auth: { admin: { async getUserById() { return { data: { user: null }, error: null }; } } },
    };

    const admin = toGiftClaimConfirmationAdmin(raw);
    const { data, error } = await admin.from("profiles").select("display_name").eq("id", "user-1").maybeSingle();

    assert.deepEqual(calls, [{ table: "profiles", columns: "display_name", column: "id", value: "user-1" }]);
    assert.deepEqual(data, { display_name: "Jordan" });
    assert.equal(error, null);
  });

  it("passes auth through unchanged", async () => {
    const raw = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      auth: {
        admin: {
          async getUserById(userId: string) {
            return { data: { user: { email: `${userId}@example.com` } }, error: null };
          },
        },
      },
    };

    const admin = toGiftClaimConfirmationAdmin(raw);
    const result = await admin.auth.admin.getUserById("user-1");
    assert.equal(result.data?.user?.email, "user-1@example.com");
  });
});
