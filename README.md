# auth-agent

Run AI agents using **Claude Max** or **ChatGPT Plus/Pro** subscription credits — no paid API keys needed.

`auth-agent` stores OAuth credentials for Anthropic and OpenAI Codex on your local machine and exposes them as:

- **A CLI** — log in, check status, and run one-off prompts
- **A Node.js library** — call Claude or GPT-4o from any TypeScript/JavaScript project by reading the saved credentials

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
  - [auth login](#auth-login)
  - [auth status](#auth-status)
  - [auth remove](#auth-remove)
  - [run](#run)
- [Library Usage](#library-usage)
  - [resolveToken](#resolvetoken)
  - [callAnthropic](#callanthropic)
  - [callCodex](#callcodex)
  - [Low-level store access](#low-level-store-access)
- [Configuration](#configuration)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 20.0.0 |
| npm | ≥ 10 |
| Claude Code CLI (`claude`) | Latest — for Anthropic login |
| ChatGPT Plus or Pro account | — for OpenAI Codex login |

---

## Installation

### As a global CLI tool

```bash
npm install -g auth-agent
```

### As a project dependency (library usage)

```bash
npm install auth-agent
```

---

## Quick Start

### Anthropic (Claude Max subscription)

```bash
# Step 1 — Generate a setup token with the Claude Code CLI
claude setup-token

# Step 2 — Save it to auth-agent
auth-agent auth login --provider anthropic
# Paste the sk-ant-oat-... token when prompted

# Step 3 — Run a prompt
auth-agent run "Explain PKCE in one sentence" --provider anthropic
```

### OpenAI Codex (ChatGPT Plus/Pro subscription)

```bash
# Step 1 — Authenticate via browser (PKCE OAuth flow)
auth-agent auth login --provider openai-codex
# A browser window opens; sign in with your ChatGPT account

# Step 2 — Run a prompt
auth-agent run "What is 2 + 2?" --provider openai-codex
```

---

## CLI Reference

<!-- AUTO-GENERATED from src/cli.ts + package.json scripts -->

### `auth login`

Authenticate with a provider and save credentials locally.

```
auth-agent auth login --provider <provider>
```

| Provider | Auth method | Credential type |
|----------|-------------|-----------------|
| `anthropic` | Paste `sk-ant-oat-...` token from `claude setup-token` | Static bearer token |
| `openai-codex` | Browser-based PKCE OAuth flow | Refreshable OAuth token |

**Anthropic example:**

```bash
# First generate the token:
claude setup-token

# Then paste it here:
auth-agent auth login --provider anthropic
```

**OpenAI Codex example (local machine):**

```bash
auth-agent auth login --provider openai-codex
# A browser window opens automatically
```

**OpenAI Codex example (headless / SSH server):**

```bash
auth-agent auth login --provider openai-codex
# Prints a URL — paste it in your local browser, then paste the redirect URL back
```

---

### `auth status`

Display all saved credentials and their validity.

```bash
auth-agent auth status
```

Example output:

```
Store: /Users/you/.auth-agent/auth-profiles.json

  anthropic:subscription: ✓ valid (token, expiry: no expiry)
  openai-codex:subscription: ✓ valid
    expires: 3/10/2026, 7:15:00 AM
    accountId: user_abc123
```

---

### `auth remove`

Delete stored credentials for a provider.

```bash
auth-agent auth remove --provider <provider>
```

```bash
auth-agent auth remove --provider anthropic
auth-agent auth remove --provider openai-codex
```

---

### `run`

Run a single prompt using stored credentials.

```
auth-agent run <prompt> --provider <provider> [--model <model>] [--max-tokens <n>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--provider` | *(required)* | `anthropic` or `openai-codex` |
| `--model` | `claude-sonnet-4-5` / `gpt-4o` | Model ID to use |
| `--max-tokens` | `1024` | Maximum tokens to generate |

**Examples:**

```bash
# Claude (default model: claude-sonnet-4-5)
auth-agent run "Write a haiku about TypeScript" --provider anthropic

# Claude with specific model
auth-agent run "Write a haiku" --provider anthropic --model claude-opus-4-5

# GPT-4o (default model: gpt-4o)
auth-agent run "What is PKCE?" --provider openai-codex

# GPT-4o mini with token limit
auth-agent run "Hello" --provider openai-codex --model gpt-4o-mini --max-tokens 256
```

---

## Library Usage

`auth-agent` exports a TypeScript-first library for use inside other projects. The user must have previously run `auth-agent auth login` on their machine.

### Install

```bash
npm install auth-agent
```

### `resolveToken`

Returns a valid access token for the given provider. Handles OAuth token refresh automatically — your code never needs to deal with expiry.

```typescript
import { resolveToken } from "auth-agent";

const { token, provider } = await resolveToken("anthropic");
// token: "sk-ant-oat-..."

const { token: codexToken } = await resolveToken("openai-codex");
// token: "eyJhbGci..." (JWT, auto-refreshed if expired)
```

**Signature:**

```typescript
resolveToken(provider: "anthropic" | "openai-codex"): Promise<ResolvedToken>

type ResolvedToken = {
  token: string;
  accountId?: string;  // present for openai-codex
  provider: string;
};
```

**Throws** if no credentials are found (user has not logged in) or if a static token has expired.

---

### `callAnthropic`

Call Claude with a subscription token. Returns the full response text and token usage.

```typescript
import { resolveToken, callAnthropic } from "auth-agent";

const { token } = await resolveToken("anthropic");

const response = await callAnthropic({
  token,
  model: "claude-sonnet-4-5",
  prompt: "Explain dependency injection in one paragraph.",
  maxTokens: 512,
});

console.log(response.text);
console.log(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
```

**Options:**

```typescript
type AnthropicCallOptions = {
  token: string;         // from resolveToken("anthropic")
  model: string;         // e.g. "claude-sonnet-4-5", "claude-opus-4-5"
  prompt: string;
  maxTokens?: number;    // default: 1024
};

type AnthropicCallResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};
```

---

### `callCodex`

Call GPT-4o (or other OpenAI models) with a ChatGPT Plus/Pro subscription token. The API uses SSE streaming internally; `callCodex` returns the accumulated text once complete.

The `accountId` is extracted automatically from the JWT — **do not pass it manually**.

```typescript
import { resolveToken, callCodex } from "auth-agent";

const { token } = await resolveToken("openai-codex");

const response = await callCodex({
  token,
  model: "gpt-4o",
  prompt: "What is the capital of France?",
  maxTokens: 256,
});

console.log(response.text);
```

**Options:**

```typescript
type CodexCallOptions = {
  token: string;       // from resolveToken("openai-codex")
  model: string;       // e.g. "gpt-4o", "gpt-4o-mini"
  prompt: string;
  maxTokens?: number;  // default: 1024
};

type CodexCallResult = {
  text: string;
  model: string;
};
```

---

### Combining both providers

```typescript
import { resolveToken, callAnthropic, callCodex } from "auth-agent";

async function runWithProvider(provider: "anthropic" | "openai-codex", prompt: string) {
  const { token } = await resolveToken(provider);

  if (provider === "anthropic") {
    const { text } = await callAnthropic({ token, model: "claude-sonnet-4-5", prompt });
    return text;
  } else {
    const { text } = await callCodex({ token, model: "gpt-4o", prompt });
    return text;
  }
}

const answer = await runWithProvider("anthropic", "Hello!");
```

---

### Low-level store access

For advanced use cases (e.g. building your own provider or inspecting stored credentials):

```typescript
import { loadStore, getProfile } from "auth-agent";

const store = loadStore();
const cred = getProfile(store, "anthropic:subscription");

if (cred?.type === "token") {
  console.log("Anthropic token:", cred.token);
}
```

**Exported types:**

```typescript
import type {
  AuthProfileStore,       // { version: 1; profiles: Record<string, AuthProfileCredential> }
  AuthProfileCredential,  // TokenCredential | OAuthCredential
  TokenCredential,        // { type: "token"; provider: string; token: string; expires?: number }
  OAuthCredential,        // { type: "oauth"; provider: string; access: string; refresh: string; expires: number }
} from "auth-agent";
```

---

## Configuration

<!-- AUTO-GENERATED from src/config.ts -->

Credentials are stored as JSON on your local filesystem. No secrets are sent to any server.

### Credential store path

Resolution order (first match wins):

| Priority | Condition | Path |
|----------|-----------|------|
| 1 | `AUTH_AGENT_STORE_DIR` is set | `$AUTH_AGENT_STORE_DIR/auth-profiles.json` |
| 2 | `XDG_CONFIG_HOME` is set | `$XDG_CONFIG_HOME/auth-agent/auth-profiles.json` |
| 3 | Default | `~/.auth-agent/auth-profiles.json` |

The file is created with `600` permissions (owner read/write only).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_AGENT_STORE_DIR` | No | Override the credential store directory (useful for CI or multi-user setups) |
| `XDG_CONFIG_HOME` | No | XDG Base Directory — respected if set |

**CI / isolated environment example:**

```bash
export AUTH_AGENT_STORE_DIR=/tmp/my-ci-store
auth-agent auth status
```

---

## Development

### Clone and install

```bash
git clone https://github.com/you/auth-agent.git
cd auth-agent
npm install
```

<!-- AUTO-GENERATED from package.json scripts -->

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Run CLI directly from source (no build step) via `tsx` |
| `npm test` | Run full test suite (Vitest, single-run) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run prepublishOnly` | Build + test (runs automatically before `npm publish`) |

### Run CLI from source

```bash
npm run dev -- auth status
npm run dev -- auth login --provider anthropic
npm run dev -- run "Hello!" --provider anthropic
```

### Run tests

```bash
npm test                              # all tests
npm test test/codex-call.test.ts      # single file
npm run test:watch                    # watch mode
```

All tests use [Vitest](https://vitest.dev/). The test suite mocks `fetch` via `vi.stubGlobal` and uses temporary directories for credential store isolation — no real network calls are made.

### Build for distribution

```bash
npm run build
# Output: dist/ (JS + .d.ts type declarations + source maps)
```

### Project structure

```
src/
  cli.ts              Entry point — Commander.js command definitions
  config.ts           Credential store path resolution
  index.ts            Public library exports
  auth/
    types.ts          Credential type definitions
    store.ts          Read/write auth-profiles.json
    anthropic.ts      Anthropic login flow (paste setup-token)
    codex.ts          OpenAI Codex login flow (PKCE OAuth)
    resolve.ts        Token resolution + OAuth auto-refresh
  llm/
    anthropic-call.ts Claude API call using @anthropic-ai/sdk
    codex-call.ts     GPT-4o call via ChatGPT Codex endpoint (SSE)
test/
  store.test.ts       Store read/write unit tests
  resolve.test.ts     Token resolution + refresh unit tests
  codex-call.test.ts  Codex headers, body, SSE parsing tests
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

[MIT](./LICENSE)
