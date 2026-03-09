import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Set up isolated store dir BEFORE importing store module
// (config.ts reads env at call-time, so this works)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-agent-test-"));
process.env.AUTH_AGENT_STORE_DIR = tmpDir;

// Dynamic imports after env is set
const { loadStore, saveStore, upsertProfile, removeProfile, upsertAndSave, getProfile } =
  await import("../src/auth/store.js");
const { getStorePath, getStoreDir } = await import("../src/config.js");

describe("store", () => {
  beforeEach(() => {
    // Clean up store file before each test
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }
  });

  afterEach(() => {
    // Clean slate
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }
  });

  it("returns empty store when file does not exist", () => {
    const store = loadStore();
    expect(store.version).toBe(1);
    expect(store.profiles).toEqual({});
  });

  it("saves and reloads a TokenCredential", () => {
    const initial = loadStore();
    const updated = upsertProfile(initial, "anthropic:subscription", {
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-test-token-abc123",
    });
    saveStore(updated);

    const reloaded = loadStore();
    expect(reloaded.profiles["anthropic:subscription"]).toEqual({
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-test-token-abc123",
    });
  });

  it("saves and reloads an OAuthCredential", () => {
    const initial = loadStore();
    const expires = Date.now() + 3600_000;
    const updated = upsertProfile(initial, "openai-codex:subscription", {
      type: "oauth",
      provider: "openai-codex",
      access: "eyJ_access_token",
      refresh: "eyJ_refresh_token",
      expires,
      accountId: "acc_123",
    });
    saveStore(updated);

    const reloaded = loadStore();
    const cred = reloaded.profiles["openai-codex:subscription"];
    expect(cred?.type).toBe("oauth");
    if (cred?.type === "oauth") {
      expect(cred.access).toBe("eyJ_access_token");
      expect(cred.accountId).toBe("acc_123");
      expect(cred.expires).toBe(expires);
    }
  });

  it("upsertProfile returns new store (immutable)", () => {
    const original = loadStore();
    const updated = upsertProfile(original, "test:profile", {
      type: "token",
      provider: "test",
      token: "tok123",
    });
    // Original should be unchanged
    expect(original.profiles["test:profile"]).toBeUndefined();
    expect(updated.profiles["test:profile"]).toBeDefined();
  });

  it("removeProfile returns new store without the profile", () => {
    const store = upsertProfile(loadStore(), "anthropic:subscription", {
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-test",
    });
    saveStore(store);

    const removed = removeProfile(store, "anthropic:subscription");
    expect(removed.profiles["anthropic:subscription"]).toBeUndefined();
    // Original store should still have the profile
    expect(store.profiles["anthropic:subscription"]).toBeDefined();
  });

  it("upsertAndSave persists to disk", () => {
    upsertAndSave("anthropic:subscription", {
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-persisted",
    });
    const store = loadStore();
    expect(store.profiles["anthropic:subscription"]).toBeDefined();
  });

  it("getProfile returns credential by ID", () => {
    const store = upsertProfile(loadStore(), "anthropic:subscription", {
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-gettest",
    });
    const cred = getProfile(store, "anthropic:subscription");
    expect(cred?.type).toBe("token");
    expect(getProfile(store, "nonexistent")).toBeUndefined();
  });

  it("skips invalid profiles and keeps valid ones on load", () => {
    const storePath = getStorePath();
    const raw = JSON.stringify({
      version: 1,
      profiles: {
        "valid:profile": { type: "token", provider: "test", token: "tok-abc" },
        "invalid:no-token": { type: "token", provider: "test" }, // missing token
        "invalid:no-access": { type: "oauth", provider: "x" },  // missing access/refresh/expires
      },
    });
    fs.writeFileSync(storePath, raw);

    const store = loadStore();
    expect(store.profiles["valid:profile"]).toBeDefined();
    expect(store.profiles["invalid:no-token"]).toBeUndefined();
    expect(store.profiles["invalid:no-access"]).toBeUndefined();
  });

  it("sets file permissions to 600", () => {
    upsertAndSave("anthropic:subscription", {
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-perms",
    });
    const storePath = getStorePath();
    const stat = fs.statSync(storePath);
    // Check owner read/write (0o600)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("config path resolution", () => {
  it("uses AUTH_AGENT_STORE_DIR when set", () => {
    expect(getStoreDir()).toBe(tmpDir);
    expect(getStorePath()).toBe(path.join(tmpDir, "auth-profiles.json"));
  });

  it("falls back to XDG_CONFIG_HOME when AUTH_AGENT_STORE_DIR is unset", () => {
    const saved = process.env.AUTH_AGENT_STORE_DIR;
    delete process.env.AUTH_AGENT_STORE_DIR;
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-test";
    const dir = getStoreDir();
    expect(dir).toBe("/tmp/xdg-test/auth-agent");
    // Restore
    process.env.AUTH_AGENT_STORE_DIR = saved;
    delete process.env.XDG_CONFIG_HOME;
  });
});
