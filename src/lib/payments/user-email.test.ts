import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getUserEmailById } from "./user-email.ts";

describe("getUserEmailById", () => {
  it("returns the user's email when found", async () => {
    const admin = {
      auth: {
        admin: {
          async getUserById(userId: string) {
            assert.equal(userId, "user-1");
            return { data: { user: { email: "purchaser@example.com" } }, error: null };
          },
        },
      },
    };

    assert.equal(await getUserEmailById(admin, "user-1"), "purchaser@example.com");
  });

  it("returns null when the user is not found", async () => {
    const admin = {
      auth: {
        admin: {
          async getUserById() {
            return { data: { user: null }, error: null };
          },
        },
      },
    };

    assert.equal(await getUserEmailById(admin, "missing"), null);
  });

  it("returns null when the user has no email", async () => {
    const admin = {
      auth: {
        admin: {
          async getUserById() {
            return { data: { user: { email: null } }, error: null };
          },
        },
      },
    };

    assert.equal(await getUserEmailById(admin, "user-1"), null);
  });

  it("returns null on a lookup error, rather than throwing", async () => {
    const admin = {
      auth: {
        admin: {
          async getUserById() {
            return { data: null, error: { message: "boom" } };
          },
        },
      },
    };

    assert.equal(await getUserEmailById(admin, "user-1"), null);
  });
});
