/**
 * Anthropic subscription token login flow.
 *
 * The user runs `claude setup-token` with the Claude Code CLI to generate a
 * long-lived bearer token (sk-ant-oat-...). This token is stored as a
 * TokenCredential — it is NOT an OAuth token and does not auto-refresh.
 *
 * Profile ID: "anthropic:subscription"
 */
import readline from "node:readline";
import { upsertAndSave } from "./store.js";

export const ANTHROPIC_PROFILE_ID = "anthropic:subscription";
const TOKEN_PREFIX = "sk-ant-oat-";

function isValidAnthropicSetupToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.length > TOKEN_PREFIX.length + 10;
}

async function promptForToken(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log("\n┌─ Anthropic Subscription Login ───────────────────────────────────");
    console.log("│");
    console.log("│  1. Run the following command in your terminal:");
    console.log("│");
    console.log("│       claude setup-token");
    console.log("│");
    console.log("│  2. Copy the entire output line (starts with sk-ant-oat-...)");
    console.log("│");
    console.log("└───────────────────────────────────────────────────────────────────\n");
    rl.question("Paste the token here: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive Anthropic setup-token login.
 * Prompts the user to paste a token, validates it, then saves to the store.
 */
export async function loginAnthropic(): Promise<void> {
  const token = await promptForToken();

  if (!token) {
    throw new Error("No token provided. Run `claude setup-token` to generate one.");
  }
  if (!isValidAnthropicSetupToken(token)) {
    throw new Error(
      `Invalid token format. Expected a token starting with "${TOKEN_PREFIX}". ` +
        "Run `claude setup-token` to generate a valid token.",
    );
  }

  upsertAndSave(ANTHROPIC_PROFILE_ID, {
    type: "token",
    provider: "anthropic",
    token,
  });

  console.log(`\n✓ Anthropic subscription token saved (profile: ${ANTHROPIC_PROFILE_ID})`);
  console.log("  Run `auth-agent auth status` to verify.\n");
}
