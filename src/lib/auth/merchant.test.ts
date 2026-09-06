/**
 * Merchant authorization helper tests. Run with `npm test`.
 *
 * These exercise the membership/role logic with an in-memory fake Supabase
 * client — no network and no hosted project access.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canManageMerchant,
  createMerchantAccount,
  getActiveMembership,
  isActiveMerchantMember,
} from "./merchant.ts";

type Result = { data: unknown; error: unknown };

type FakeConfig = {
  members?: Result;
  merchant?: Result;
  rpc?: Result;
};

type Client = Parameters<typeof getActiveMembership>[0];

/** Build a chainable query stub whose terminal `maybeSingle` yields `result`. */
function queryBuilder(result: Result) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  chain.select = passthrough;
  chain.eq = passthrough;
  chain.order = passthrough;
  chain.limit = passthrough;
  chain.maybeSingle = async () => result;
  return chain;
}

function makeClient(config: FakeConfig) {
  const calls = { rpc: 0 };
  const client = {
    from(table: string) {
      if (table === "merchant_members") {
        return queryBuilder(config.members ?? { data: null, error: null });
      }
      if (table === "merchant_accounts") {
        return queryBuilder(config.merchant ?? { data: null, error: null });
      }
      throw new Error(`unexpected table: ${table}`);
    },
    async rpc() {
      calls.rpc += 1;
      return config.rpc ?? { data: null, error: null };
    },
  };
  return { client: client as unknown as Client, calls };
}

describe("getActiveMembership", () => {
  it("returns the membership when an active row exists", async () => {
    const { client } = makeClient({
      members: {
        data: { merchant_account_id: "m-1", role: "owner" },
        error: null,
      },
    });
    assert.deepEqual(await getActiveMembership(client, "u-1"), {
      merchantAccountId: "m-1",
      role: "owner",
    });
  });

  it("returns null for a customer-only user (no membership row)", async () => {
    const { client } = makeClient({ members: { data: null, error: null } });
    assert.equal(await getActiveMembership(client, "u-2"), null);
  });

  it("returns null when the query errors", async () => {
    const { client } = makeClient({
      members: { data: null, error: { message: "boom" } },
    });
    assert.equal(await getActiveMembership(client, "u-3"), null);
  });

  it("returns null when the role value is not a known merchant role", async () => {
    const { client } = makeClient({
      members: { data: { merchant_account_id: "m-1", role: "wat" }, error: null },
    });
    assert.equal(await getActiveMembership(client, "u-4"), null);
  });
});

describe("isActiveMerchantMember", () => {
  it("is true for an active member", async () => {
    const { client } = makeClient({
      members: { data: { merchant_account_id: "m", role: "staff" }, error: null },
    });
    assert.equal(await isActiveMerchantMember(client, "u"), true);
  });

  it("is false for a non-member", async () => {
    const { client } = makeClient({ members: { data: null, error: null } });
    assert.equal(await isActiveMerchantMember(client, "u"), false);
  });
});

describe("canManageMerchant", () => {
  it("allows owner and admin, denies staff and empty", () => {
    assert.equal(canManageMerchant("owner"), true);
    assert.equal(canManageMerchant("admin"), true);
    assert.equal(canManageMerchant("staff"), false);
    assert.equal(canManageMerchant(null), false);
  });
});

describe("createMerchantAccount", () => {
  it("rejects a blank business name without calling the RPC", async () => {
    const { client, calls } = makeClient({});
    const result = await createMerchantAccount(client, "u", {
      displayName: "   ",
    });
    assert.equal(result.ok, false);
    assert.equal(calls.rpc, 0);
  });

  it("is idempotent: returns the existing merchant without calling the RPC", async () => {
    const { client, calls } = makeClient({
      members: {
        data: { merchant_account_id: "existing", role: "owner" },
        error: null,
      },
    });
    const result = await createMerchantAccount(client, "u", {
      displayName: "Cafe",
    });
    assert.deepEqual(result, {
      ok: true,
      merchantAccountId: "existing",
      alreadyMember: true,
    });
    assert.equal(calls.rpc, 0);
  });

  it("creates via RPC when the user has no membership", async () => {
    const { client, calls } = makeClient({
      members: { data: null, error: null },
      rpc: { data: { merchant_account_id: "new-1" }, error: null },
    });
    const result = await createMerchantAccount(client, "u", {
      displayName: "Cafe",
    });
    assert.deepEqual(result, {
      ok: true,
      merchantAccountId: "new-1",
      alreadyMember: false,
    });
    assert.equal(calls.rpc, 1);
  });

  it("surfaces an RPC error", async () => {
    const { client } = makeClient({
      members: { data: null, error: null },
      rpc: { data: null, error: { message: "denied" } },
    });
    const result = await createMerchantAccount(client, "u", {
      displayName: "Cafe",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "denied");
  });
});
