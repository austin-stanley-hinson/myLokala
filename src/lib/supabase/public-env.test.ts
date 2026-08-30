import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPublicSupabaseAnonKey,
  getPublicSupabaseUrl,
  hasPublicSupabaseEnv,
} from "./public-env.ts";

function snapshotEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function restoreEnv(snapshot: ReturnType<typeof snapshotEnv>) {
  restoreVar("NEXT_PUBLIC_SUPABASE_URL", snapshot.url);
  restoreVar("NEXT_PUBLIC_SUPABASE_ANON_KEY", snapshot.anon);
  restoreVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", snapshot.publishable);
}

function restoreVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("hasPublicSupabaseEnv", () => {
  it("accepts the legacy anon key name", () => {
    const previous = snapshotEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    try {
      assert.equal(getPublicSupabaseUrl(), "https://example.supabase.co");
      assert.equal(getPublicSupabaseAnonKey(), "anon-test");
      assert.equal(hasPublicSupabaseEnv(), true);
    } finally {
      restoreEnv(previous);
    }
  });

  it("accepts the dashboard publishable key name", () => {
    const previous = snapshotEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    try {
      assert.equal(getPublicSupabaseAnonKey(), "sb_publishable_test");
      assert.equal(hasPublicSupabaseEnv(), true);
    } finally {
      restoreEnv(previous);
    }
  });

  it("is false when both key names are missing", () => {
    const previous = snapshotEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    try {
      assert.equal(getPublicSupabaseAnonKey(), undefined);
      assert.equal(hasPublicSupabaseEnv(), false);
    } finally {
      restoreEnv(previous);
    }
  });
});
