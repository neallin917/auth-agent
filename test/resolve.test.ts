import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolated store directory for tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-agent-resolve-test-"));
process.env.AUTH_AGENT_STORE_DIR = tmpDir;

// Mock @mariozechner/pi-ai/oauth before importing resolve module
vi.mock("@mariozechner/pi-ai/oauth", () => ({
  getOAuthApiKey: vi.fn(),
  loginOpenAICodex: vi.fn(),
  getOAuthProviders: vi.fn(() => []),
}));

const { resolveToken } = await import("../src/auth/resolve.js");
const { loadStore, saveStore, upsertProfile } = await import("../src/auth/store.js");
const { getOAuthApiKey } = await import("@mariozechner/pi-ai/oauth");

describe("resolveToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storePath = path.join(tmpDir, "auth-profiles.json");
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }
  });

  afterEach(() => {
    const storePath = path.join(tmpDir, "auth-profiles.json");
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }
  });

  it("throws when no credentials exist for the provider", async () => {
    await expect(resolveToken("anthropic")).rejects.toThrow(
      'No credentials found for provider "anthropic"',
    );
  });

  it("resolves a valid TokenCredential", async () => {
    const store = upsertProfile(loadStore(), "anthropic:subscription", {
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-valid-token",
    });
    saveStore(store);

    const result = await resolveToken("anthropic");
    expect(result.token).toBe("sk-ant-oat-valid-token");
    expect(result.provider).toBe("anthropic");
  });

  it("throws for an expired TokenCredential", async () => {
    const store = upsertProfile(loadStore(), "anthropic:subscription", {
      type: "token",
      provider: "anthropic",
      token: "sk-ant-oat-expired",
      expires: Date.now() - 1000, // already expired
    });
    saveStore(store);

    await expect(resolveToken("anthropic")).rejects.toThrow("has expired");
  });

  it("returns access token when OAuth is still valid", async () => {
    const expires = Date.now() + 3600_000; // 1 hour from now
    const store = upsertProfile(loadStore(), "openai-codex:subscription", {
      type: "oauth",
      provider: "openai-codex",
      access: "fresh_access_token",
      refresh: "refresh_token",
      expires,
      accountId: "acc_xyz",
    });
    saveStore(store);

    const result = await resolveToken("openai-codex");
    expect(result.token).toBe("fresh_access_token");
    expect(result.accountId).toBe("acc_xyz");
    // Should NOT have called getOAuthApiKey since token is still valid
    expect(getOAuthApiKey).not.toHaveBeenCalled();
  });

  it("refreshes OAuth token when expired", async () => {
    const expiredExpires = Date.now() - 1000;
    const store = upsertProfile(loadStore(), "openai-codex:subscription", {
      type: "oauth",
      provider: "openai-codex",
      access: "old_access_token",
      refresh: "refresh_token",
      expires: expiredExpires,
      accountId: "acc_xyz",
    });
    saveStore(store);

    const newExpires = Date.now() + 3600_000;
    vi.mocked(getOAuthApiKey).mockResolvedValueOnce({
      apiKey: "new_access_token",
      newCredentials: {
        access: "new_access_token",
        refresh: "new_refresh_token",
        expires: newExpires,
        accountId: "acc_xyz",
      },
    });

    const result = await resolveToken("openai-codex");
    expect(result.token).toBe("new_access_token");
    expect(getOAuthApiKey).toHaveBeenCalledOnce();

    // Verify that new credentials were persisted
    const updatedStore = loadStore();
    const cred = updatedStore.profiles["openai-codex:subscription"];
    expect(cred?.type).toBe("oauth");
    if (cred?.type === "oauth") {
      expect(cred.access).toBe("new_access_token");
      expect(cred.expires).toBe(newExpires);
    }
  });

  it("throws when OAuth refresh returns null", async () => {
    const store = upsertProfile(loadStore(), "openai-codex:subscription", {
      type: "oauth",
      provider: "openai-codex",
      access: "old_token",
      refresh: "bad_refresh",
      expires: Date.now() - 1000,
    });
    saveStore(store);

    vi.mocked(getOAuthApiKey).mockResolvedValueOnce(null);

    await expect(resolveToken("openai-codex")).rejects.toThrow("Failed to refresh OAuth token");
  });
});
