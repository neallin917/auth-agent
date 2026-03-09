/**
 * OpenAI Codex (ChatGPT Plus/Pro) OAuth login flow.
 *
 * Uses the PKCE OAuth flow provided by @mariozechner/pi-ai's loginOpenAICodex.
 * Automatically handles:
 *   - Opening the browser for authentication
 *   - localhost:1455 callback or manual URL paste (for headless/remote environments)
 *   - Saving the resulting OAuthCredentials to the store
 *
 * Profile ID: "openai-codex:subscription"
 */
import { loginOpenAICodex } from "@mariozechner/pi-ai/oauth";
import readline from "node:readline";
import { upsertAndSave } from "./store.js";
import type { OAuthCredential } from "./types.js";

export const CODEX_PROFILE_ID = "openai-codex:subscription";

async function promptForUrl(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive OpenAI Codex OAuth login.
 * Opens a browser (or prints a URL for remote environments) and waits
 * for the PKCE callback, then saves credentials to the store.
 */
export async function loginCodex(): Promise<void> {
  console.log("\n┌─ OpenAI Codex (ChatGPT Plus/Pro) Login ──────────────────────────");
  console.log("│");
  console.log("│  A browser window will open for OpenAI authentication.");
  console.log("│  If running on a remote/headless server, you will be asked");
  console.log("│  to paste the redirect URL manually.");
  console.log("│");
  console.log("└───────────────────────────────────────────────────────────────────\n");

  const openFn = await import("open")
    .then(({ default: open }) => async (url: string) => {
      console.log(`  Opening browser: ${url}`);
      await open(url);
    })
    .catch(() => async (url: string) => {
      console.log(`\n  Open this URL in your browser:\n\n    ${url}\n`);
    });

  const creds = await loginOpenAICodex({
    onAuth: (info: { url: string; instructions?: string }) => {
      if (info.instructions) console.log(`\n  ${info.instructions}`);
      openFn(info.url).catch((err: unknown) => {
        process.stderr.write(
          `  ⚠ Failed to open browser: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        // fallback openFn already prints the URL; user can paste it manually
      });
    },
    onPrompt: async (prompt: { message: string; placeholder?: string }) => {
      return promptForUrl(`\n  ${prompt.message}${prompt.placeholder ? ` [${prompt.placeholder}]` : ""}: `);
    },
    onProgress: (msg: string) => {
      process.stdout.write(`  ${msg}\r`);
    },
  });

  if (!creds) {
    throw new Error("OpenAI OAuth flow did not return credentials. Please try again.");
  }

  const credential: OAuthCredential = {
    type: "oauth",
    provider: "openai-codex",
    access: creds.access,
    refresh: creds.refresh,
    expires: creds.expires,
    accountId: typeof creds.accountId === "string" ? creds.accountId : undefined,
  };

  upsertAndSave(CODEX_PROFILE_ID, credential);

  console.log(`\n✓ OpenAI Codex credentials saved (profile: ${CODEX_PROFILE_ID})`);
  if (creds.accountId) {
    console.log(`  Account ID: ${creds.accountId}`);
  }
  console.log("  Run `auth-agent auth status` to verify.\n");
}
