#!/usr/bin/env node
/**
 * auth-agent CLI entry point.
 *
 * Commands:
 *   auth-agent auth login --provider anthropic      # Paste setup-token
 *   auth-agent auth login --provider openai-codex   # PKCE OAuth
 *   auth-agent auth status                          # Show stored credentials
 *   auth-agent auth remove --provider <provider>    # Remove stored credential
 *   auth-agent run --provider <p> --model <m> <prompt>  # Run a prompt
 */
import { Command } from "commander";
import { loginAnthropic, ANTHROPIC_PROFILE_ID } from "./auth/anthropic.js";
import { loginCodex, CODEX_PROFILE_ID } from "./auth/codex.js";
import { resolveToken, type Provider } from "./auth/resolve.js";
import { loadStore, removeProfile, saveStore, resolveStorePath } from "./auth/store.js";
import { callAnthropic } from "./llm/anthropic-call.js";
import { callCodex, CODEX_DEFAULT_MODEL } from "./llm/codex-call.js";

const program = new Command();

program
  .name("auth-agent")
  .description(
    "Run AI agents using Claude Max / ChatGPT Plus subscription credits — no paid API keys needed.",
  )
  .version("0.1.0");

// ── auth sub-command group ────────────────────────────────────────────────────
const auth = program.command("auth").description("Manage authentication credentials");

auth
  .command("login")
  .description("Log in with a subscription credential")
  .requiredOption(
    "--provider <provider>",
    'Provider to log in with: "anthropic" or "openai-codex"',
  )
  .action(async (opts: { provider: string }) => {
    const provider = opts.provider as Provider;
    try {
      if (provider === "anthropic") {
        await loginAnthropic();
      } else if (provider === "openai-codex") {
        await loginCodex();
      } else {
        console.error(
          `Unknown provider "${provider}". Supported: anthropic, openai-codex`,
        );
        process.exit(1);
      }
    } catch (err) {
      console.error(`\n✗ Login failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

auth
  .command("status")
  .description("Show stored credentials and their status")
  .action(() => {
    const store = loadStore();
    const storePath = resolveStorePath();
    console.log(`\nStore: ${storePath}\n`);

    const profileIds = [ANTHROPIC_PROFILE_ID, CODEX_PROFILE_ID];
    let any = false;

    for (const profileId of profileIds) {
      const cred = store.profiles[profileId];
      if (!cred) {
        console.log(`  ${profileId}: not logged in`);
        continue;
      }
      any = true;
      if (cred.type === "token") {
        const expiry = cred.expires
          ? new Date(cred.expires).toLocaleString()
          : "no expiry";
        const expired = cred.expires ? Date.now() > cred.expires : false;
        const status = expired ? "⚠ EXPIRED" : "✓ valid";
        console.log(`  ${profileId}: ${status} (token, expiry: ${expiry})`);
      } else if (cred.type === "oauth") {
        const expiry = new Date(cred.expires).toLocaleString();
        const expired = Date.now() > cred.expires;
        const status = expired ? "⚠ expired (will auto-refresh on next use)" : "✓ valid";
        console.log(`  ${profileId}: ${status}`);
        console.log(`    expires: ${expiry}`);
        if (cred.accountId) console.log(`    accountId: ${cred.accountId}`);
      }
    }

    if (!any) {
      console.log("  No profiles logged in yet.");
      console.log("\n  To log in:");
      console.log("    auth-agent auth login --provider anthropic");
      console.log("    auth-agent auth login --provider openai-codex");
    }
    console.log();
  });

auth
  .command("remove")
  .description("Remove stored credentials for a provider")
  .requiredOption(
    "--provider <provider>",
    'Provider to remove: "anthropic" or "openai-codex"',
  )
  .action((opts: { provider: string }) => {
    const profileId =
      opts.provider === "anthropic" ? ANTHROPIC_PROFILE_ID : CODEX_PROFILE_ID;
    const store = loadStore();
    if (!store.profiles[profileId]) {
      console.log(`No credentials found for provider "${opts.provider}".`);
      return;
    }
    const updated = removeProfile(store, profileId);
    saveStore(updated);
    console.log(`✓ Removed credentials for "${opts.provider}" (profile: ${profileId})`);
  });

// ── run command ───────────────────────────────────────────────────────────────
program
  .command("run <prompt>")
  .description("Run a prompt using subscription credentials")
  .requiredOption(
    "--provider <provider>",
    'Provider to use: "anthropic" or "openai-codex"',
  )
  .option("--model <model>", "Model ID", (v, _) => v, "")
  .option("--max-tokens <n>", "Maximum tokens to generate", (v) => parseInt(v, 10), 1024)
  .action(async (prompt: string, opts: { provider: string; model: string; maxTokens: number }) => {
    const provider = opts.provider as Provider;

    // Default models
    // Note: openai-codex endpoint only accepts Codex-family models (gpt-5.x-codex-*).
    // Standard chat models like gpt-4o are rejected with HTTP 400.
    const defaultModels: Record<Provider, string> = {
      anthropic: "claude-sonnet-4-5",
      "openai-codex": CODEX_DEFAULT_MODEL,
    };
    const model = opts.model || defaultModels[provider] || "";

    if (!model) {
      console.error(`Unknown provider "${provider}". Supported: anthropic, openai-codex`);
      process.exit(1);
    }

    try {
      process.stdout.write(`\n[${provider}/${model}] `);
      const resolved = await resolveToken(provider);

      let result: string;
      if (provider === "anthropic") {
        const response = await callAnthropic({
          token: resolved.token,
          model,
          prompt,
          maxTokens: opts.maxTokens,
        });
        result = response.text;
        console.log();
        console.log(result);
        console.log(
          `\n  Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`,
        );
      } else if (provider === "openai-codex") {
        const response = await callCodex({
          token: resolved.token,
          accountId: resolved.accountId,
          model,
          prompt,
          maxTokens: opts.maxTokens,
        });
        result = response.text;
        console.log();
        console.log(result);
      } else {
        console.error(`Unknown provider "${provider}"`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
