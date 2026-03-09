/**
 * CLI integration tests.
 *
 * These tests run the CLI as a real subprocess (via `tsx`) so that the full
 * Commander.js command-parsing, credential loading, and output formatting are
 * exercised end-to-end without mocking internal modules.
 *
 * Every test gets its own isolated credential store via AUTH_AGENT_STORE_DIR.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const projectRoot = path.resolve(fileURLToPath(import.meta.url), "../../");
const cliPath = path.join(projectRoot, "src", "cli.ts");
const nodeArgs = ["--import", "tsx/esm", cliPath];

/** Spawn the CLI in a subprocess and return stdout, stderr, and exit code. */
function runCli(
  args: string[],
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [...nodeArgs, ...args], {
    env: { ...process.env, ...extraEnv },
    encoding: "utf-8",
    timeout: 15_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

/** Write a minimal auth-profiles.json into a directory. */
function writeStore(dir: string, profiles: Record<string, unknown>): void {
  const storePath = path.join(dir, "auth-profiles.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({ version: 1, profiles }),
    { mode: 0o600 },
  );
}

/** Create a fresh temp dir and return it plus a helper that runs CLI against it. */
function makeTempEnv(): { storeDir: string; run: typeof runCli } {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-agent-cli-int-"));
  const run = (args: string[], extra: Record<string, string> = {}) =>
    runCli(args, { AUTH_AGENT_STORE_DIR: storeDir, ...extra });
  return { storeDir, run };
}

// Clean up all temp dirs after all tests
const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempEnvTracked(): ReturnType<typeof makeTempEnv> {
  const env = makeTempEnv();
  tempDirs.push(env.storeDir);
  return env;
}

// ─── auth status ─────────────────────────────────────────────────────────────

describe("auth status", () => {
  it("shows both providers as 'not logged in' on an empty store", () => {
    const { run } = makeTempEnvTracked();
    const { stdout, status } = run(["auth", "status"]);

    expect(status).toBe(0);
    expect(stdout).toContain("anthropic:subscription: not logged in");
    expect(stdout).toContain("openai-codex:subscription: not logged in");
  });

  it("shows 'No profiles logged in yet' hint on an empty store", () => {
    const { run } = makeTempEnvTracked();
    const { stdout } = run(["auth", "status"]);

    expect(stdout).toContain("No profiles logged in yet.");
    expect(stdout).toContain("auth-agent auth login --provider anthropic");
    expect(stdout).toContain("auth-agent auth login --provider openai-codex");
  });

  it("prints the store file path", () => {
    const { storeDir, run } = makeTempEnvTracked();
    const { stdout } = run(["auth", "status"]);

    expect(stdout).toContain(storeDir);
    expect(stdout).toContain("auth-profiles.json");
  });

  it("shows valid status for a TokenCredential with no expiry", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "anthropic:subscription": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-oat-test-token",
      },
    });

    const { stdout, status } = run(["auth", "status"]);

    expect(status).toBe(0);
    expect(stdout).toContain("anthropic:subscription");
    expect(stdout).toContain("valid");
    expect(stdout).toContain("no expiry");
  });

  it("shows valid status for a TokenCredential with a future expiry", () => {
    const { storeDir, run } = makeTempEnvTracked();
    const futureExpiry = Date.now() + 7_200_000; // 2 hours from now
    writeStore(storeDir, {
      "anthropic:subscription": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-oat-expiring",
        expires: futureExpiry,
      },
    });

    const { stdout } = run(["auth", "status"]);

    expect(stdout).toContain("valid");
    expect(stdout).not.toContain("EXPIRED");
  });

  it("shows EXPIRED for an expired TokenCredential", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "anthropic:subscription": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-oat-old",
        expires: Date.now() - 1_000, // already expired
      },
    });

    const { stdout } = run(["auth", "status"]);

    expect(stdout).toContain("EXPIRED");
  });

  it("shows valid OAuth status when not expired", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "openai-codex:subscription": {
        type: "oauth",
        provider: "openai-codex",
        access: "eyJ_access",
        refresh: "eyJ_refresh",
        expires: Date.now() + 3_600_000,
        accountId: "acc_abc123",
      },
    });

    const { stdout, status } = run(["auth", "status"]);

    expect(status).toBe(0);
    expect(stdout).toContain("openai-codex:subscription");
    expect(stdout).toContain("valid");
    expect(stdout).toContain("acc_abc123");
  });

  it("shows auto-refresh hint for expired OAuth credential", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "openai-codex:subscription": {
        type: "oauth",
        provider: "openai-codex",
        access: "eyJ_old_access",
        refresh: "eyJ_refresh",
        expires: Date.now() - 5_000,
        accountId: "acc_expired",
      },
    });

    const { stdout } = run(["auth", "status"]);

    expect(stdout).toContain("expired");
    expect(stdout).toContain("auto-refresh");
  });

  it("shows both providers when both have credentials", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "anthropic:subscription": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-oat-abc",
      },
      "openai-codex:subscription": {
        type: "oauth",
        provider: "openai-codex",
        access: "eyJ_access",
        refresh: "eyJ_refresh",
        expires: Date.now() + 3_600_000,
        accountId: "acc_xyz",
      },
    });

    const { stdout } = run(["auth", "status"]);

    expect(stdout).toContain("anthropic:subscription");
    expect(stdout).toContain("openai-codex:subscription");
    // Both should show as valid, not "not logged in"
    expect(stdout).not.toContain("No profiles logged in yet.");
  });

  it("exits with code 0", () => {
    const { run } = makeTempEnvTracked();
    const { status } = run(["auth", "status"]);
    expect(status).toBe(0);
  });
});

// ─── auth remove ─────────────────────────────────────────────────────────────

describe("auth remove", () => {
  it("removes an Anthropic TokenCredential and confirms removal", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "anthropic:subscription": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-oat-to-remove",
      },
    });

    const { stdout, status } = run(["auth", "remove", "--provider", "anthropic"]);

    expect(status).toBe(0);
    expect(stdout).toContain("Removed");
    expect(stdout).toContain("anthropic");
    expect(stdout).toContain("anthropic:subscription");
  });

  it("removes an OpenAI-Codex OAuthCredential and confirms removal", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "openai-codex:subscription": {
        type: "oauth",
        provider: "openai-codex",
        access: "eyJ_access",
        refresh: "eyJ_refresh",
        expires: Date.now() + 3_600_000,
      },
    });

    const { stdout, status } = run(["auth", "remove", "--provider", "openai-codex"]);

    expect(status).toBe(0);
    expect(stdout).toContain("Removed");
    expect(stdout).toContain("openai-codex");
  });

  it("persists the removal so subsequent status shows 'not logged in'", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "anthropic:subscription": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-oat-to-delete",
      },
    });

    run(["auth", "remove", "--provider", "anthropic"]);
    const { stdout } = run(["auth", "status"]);

    expect(stdout).toContain("anthropic:subscription: not logged in");
  });

  it("prints a message and exits 0 when no credential exists for provider", () => {
    const { run } = makeTempEnvTracked();

    const { stdout, status } = run(["auth", "remove", "--provider", "anthropic"]);

    expect(status).toBe(0);
    expect(stdout).toContain("No credentials found");
  });

  it("only removes the specified provider, leaving the other intact", () => {
    const { storeDir, run } = makeTempEnvTracked();
    writeStore(storeDir, {
      "anthropic:subscription": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-oat-keep-me",
      },
      "openai-codex:subscription": {
        type: "oauth",
        provider: "openai-codex",
        access: "eyJ_access",
        refresh: "eyJ_refresh",
        expires: Date.now() + 3_600_000,
        accountId: "acc_xyz",
      },
    });

    run(["auth", "remove", "--provider", "openai-codex"]);
    const { stdout } = run(["auth", "status"]);

    // Anthropic credential should still be valid
    expect(stdout).toContain("anthropic:subscription");
    expect(stdout).toContain("valid");
    // OpenAI-Codex should now be gone
    expect(stdout).toContain("openai-codex:subscription: not logged in");
  });

  it("fails with exit code 1 when --provider option is missing", () => {
    const { run } = makeTempEnvTracked();
    const { status, stderr } = run(["auth", "remove"]);

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/required option|missing/i);
  });
});

// ─── auth login (validation only — no interactive flows) ─────────────────────

describe("auth login", () => {
  it("fails with exit code 1 for an unknown provider", () => {
    const { run } = makeTempEnvTracked();

    const { status, stderr } = run(["auth", "login", "--provider", "unknown-provider"]);

    expect(status).toBe(1);
    expect(stderr).toContain("unknown-provider");
  });

  it("fails with exit code 1 when --provider option is missing", () => {
    const { run } = makeTempEnvTracked();
    const { status, stderr } = run(["auth", "login"]);

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/required option|missing/i);
  });
});

// ─── run command (error paths only — real API calls are out-of-scope) ─────────

describe("run command", () => {
  it("fails with exit code 1 and actionable error when no Anthropic credentials exist", () => {
    const { run } = makeTempEnvTracked();

    const { status, stderr } = run(["run", "hello", "--provider", "anthropic"]);

    expect(status).toBe(1);
    expect(stderr).toContain("anthropic");
    // Should tell the user how to fix it
    expect(stderr).toMatch(/login|credential/i);
  });

  it("fails with exit code 1 and actionable error when no OpenAI-Codex credentials exist", () => {
    const { run } = makeTempEnvTracked();

    const { status, stderr } = run(["run", "hello", "--provider", "openai-codex"]);

    expect(status).toBe(1);
    expect(stderr).toContain("openai-codex");
  });

  it("fails with exit code 1 and error message for an unknown provider", () => {
    const { run } = makeTempEnvTracked();

    const { status, stderr } = run(["run", "hello", "--provider", "bad-provider"]);

    expect(status).toBe(1);
    expect(stderr).toMatch(/unknown provider|bad-provider/i);
  });

  it("fails when --provider is missing", () => {
    const { run } = makeTempEnvTracked();
    const { status, stderr } = run(["run", "hello"]);

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/required option|missing/i);
  });
});

// ─── top-level program flags ──────────────────────────────────────────────────

describe("program meta", () => {
  it("--version prints the version number and exits 0", () => {
    const { run } = makeTempEnvTracked();
    const { stdout, status } = run(["--version"]);

    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("--help prints usage information and exits 0", () => {
    const { run } = makeTempEnvTracked();
    const { stdout, status } = run(["--help"]);

    expect(status).toBe(0);
    expect(stdout).toContain("auth-agent");
    expect(stdout).toContain("auth");
    expect(stdout).toContain("run");
  });

  it("auth --help lists available sub-commands", () => {
    const { run } = makeTempEnvTracked();
    const { stdout, status } = run(["auth", "--help"]);

    expect(status).toBe(0);
    expect(stdout).toContain("login");
    expect(stdout).toContain("status");
    expect(stdout).toContain("remove");
  });

  it("exits with non-zero for an unrecognized top-level command", () => {
    const { run } = makeTempEnvTracked();
    const { status } = run(["not-a-command"]);

    expect(status).not.toBe(0);
  });
});
