/**
 * Credential types for auth-agent store.
 *
 * Simplified from openclaw's auth-profiles/types.ts — keeps only what is
 * needed for subscription-based (non-API-key) access.
 */

/** Static bearer token — e.g., Anthropic setup-token (sk-ant-oat-...). Not auto-refreshed. */
export type TokenCredential = {
  type: "token";
  provider: string;
  /** The bearer token value. */
  token: string;
  /** Optional expiry timestamp (ms since Unix epoch). */
  expires?: number;
  email?: string;
};

/** Refreshable OAuth credential — e.g., OpenAI Codex PKCE flow. */
export type OAuthCredential = {
  type: "oauth";
  provider: string;
  /** Current access token. */
  access: string;
  /** Refresh token used to obtain new access tokens. */
  refresh: string;
  /** Access token expiry (ms since Unix epoch). */
  expires: number;
  /** Provider-specific account identifier (required by some providers). */
  accountId?: string;
  email?: string;
};

export type AuthProfileCredential = TokenCredential | OAuthCredential;

export type AuthProfileStore = {
  version: 1;
  profiles: Record<string, AuthProfileCredential>;
};
