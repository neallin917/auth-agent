/**
 * Token resolution with automatic OAuth refresh.
 *
 * For TokenCredential (Anthropic setup-token): returns the stored token directly.
 * For OAuthCredential (OpenAI Codex): returns the access token, refreshing via
 *   getOAuthApiKey() from @mariozechner/pi-ai if expired.
 */
import { getOAuthApiKey } from "@mariozechner/pi-ai/oauth";
import { ANTHROPIC_PROFILE_ID } from "./anthropic.js";
import { CODEX_PROFILE_ID } from "./codex.js";
import { loadStore, saveStore, upsertProfile } from "./store.js";
import type { OAuthCredential } from "./types.js";

export type Provider = "anthropic" | "openai-codex";

export type ResolvedToken = {
  token: string;
  accountId?: string;
  provider: string;
};

const PROFILE_IDS: Record<Provider, string> = {
  anthropic: ANTHROPIC_PROFILE_ID,
  "openai-codex": CODEX_PROFILE_ID,
};

/**
 * Resolve the current valid access token for the given provider.
 *
 * Throws if:
 *  - No credentials are found (user needs to run `auth-agent auth login`)
 *  - Token is expired and cannot be refreshed
 */
export async function resolveToken(provider: Provider): Promise<ResolvedToken> {
  const profileId = PROFILE_IDS[provider];
  const store = loadStore();
  const cred = store.profiles[profileId];

  if (!cred) {
    throw new Error(
      `No credentials found for provider "${provider}" (profile: ${profileId}).\n` +
        `Run: auth-agent auth login --provider ${provider}`,
    );
  }

  // Static bearer token (Anthropic setup-token) — no refresh needed
  if (cred.type === "token") {
    if (cred.expires !== undefined && Date.now() > cred.expires) {
      throw new Error(
        `Token for "${provider}" has expired.\n` +
          `Run: auth-agent auth login --provider ${provider}`,
      );
    }
    return { token: cred.token, provider: cred.provider };
  }

  // OAuth credential — check expiry and refresh if needed
  if (cred.type === "oauth") {
    if (Date.now() < cred.expires) {
      return { token: cred.access, accountId: cred.accountId, provider: cred.provider };
    }

    // Token is expired — attempt refresh via pi-ai
    // Explicitly build the shape pi-ai expects, avoiding an unsafe spread of
    // OAuthCredential (which lacks [key: string]: unknown index signature).
    const piAiCred: Record<string, unknown> = {
      access: cred.access,
      refresh: cred.refresh,
      expires: cred.expires,
      ...(cred.accountId !== undefined ? { accountId: cred.accountId } : {}),
    };
    const result = await getOAuthApiKey(
      cred.provider,
      { [cred.provider]: piAiCred } as Parameters<typeof getOAuthApiKey>[1],
    );

    if (!result) {
      throw new Error(
        `Failed to refresh OAuth token for "${provider}".\n` +
          `Run: auth-agent auth login --provider ${provider}`,
      );
    }

    // Persist the new credentials — explicitly pick known fields to avoid
    // leaking unknown index-signature keys from the pi-ai response into the store.
    const updatedCred: OAuthCredential = {
      ...cred,
      access: result.newCredentials.access,
      refresh: result.newCredentials.refresh,
      expires: result.newCredentials.expires,
      accountId:
        typeof result.newCredentials.accountId === "string"
          ? result.newCredentials.accountId
          : cred.accountId,
      type: "oauth",
    };
    const updatedStore = upsertProfile(store, profileId, updatedCred);
    saveStore(updatedStore);

    return {
      token: result.apiKey,
      accountId:
        typeof result.newCredentials.accountId === "string"
          ? result.newCredentials.accountId
          : cred.accountId,
      provider: cred.provider,
    };
  }

  throw new Error(`Unsupported credential type for "${provider}".`);
}
