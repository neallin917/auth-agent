/**
 * auth-agent public library API.
 *
 * Usage in your agent project:
 *
 *   import { resolveToken, callAnthropic, callCodex } from "auth-agent";
 *
 *   // Make sure the user has run: auth-agent auth login --provider anthropic
 *   const { token } = await resolveToken("anthropic");
 *
 *   const response = await callAnthropic({
 *     token,
 *     model: "claude-sonnet-4-5",
 *     prompt: "Hello!",
 *   });
 *   console.log(response.text);
 */

// Core token resolution (handles OAuth auto-refresh transparently)
export { resolveToken } from "./auth/resolve.js";
export type { Provider, ResolvedToken } from "./auth/resolve.js";

// Credential types
export type {
  AuthProfileStore,
  AuthProfileCredential,
  TokenCredential,
  OAuthCredential,
} from "./auth/types.js";

// Store access (for advanced use — read/write the credential store directly)
export { loadStore, getProfile } from "./auth/store.js";

// LLM call helpers (optional — use your own SDK if you prefer)
export { callAnthropic } from "./llm/anthropic-call.js";
export type { AnthropicCallOptions, AnthropicCallResult } from "./llm/anthropic-call.js";

export { callCodex } from "./llm/codex-call.js";
export type { CodexCallOptions, CodexCallResult } from "./llm/codex-call.js";

// Profile ID constants
export { ANTHROPIC_PROFILE_ID } from "./auth/anthropic.js";
export { CODEX_PROFILE_ID } from "./auth/codex.js";
