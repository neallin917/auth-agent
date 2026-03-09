# auth-agent Codemap

**Last Updated:** 2026-03-09

Complete architectural map of auth-agent's codebase, module dependencies, and data flows.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Module Map](#module-map)
- [Data Flow](#data-flow)
- [Key Exports](#key-exports)
- [Dependencies](#dependencies)
- [Testing Strategy](#testing-strategy)

---

## Architecture Overview

auth-agent is a **credential manager + LLM bridge** that enables running AI agents using subscription credits instead of paid API keys.

```
┌─────────────────────────────────────────────────────────┐
│                        CLI (src/cli.ts)                  │
│    - auth login        - auth status                      │
│    - auth remove       - run                              │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
      ┌──────────────────────────┐
      │   Auth Management        │
      │  (src/auth/)             │
      │                          │
      │  ├─ store.ts ────────┐   │
      │  │  Load/save        │   │
      │  │  auth-profiles    │   │
      │  │  .json            │   │
      │  ├─ resolve.ts ──┐   │   │
      │  │  Get token,   │   │   │
      │  │  auto-refresh │   │   │
      │  ├─ anthropic.ts │   │   │
      │  │  PKCE auth    │   │   │
      │  └─ codex.ts ────┘   │   │
      │                      │   │
      └──────────────────────┘   │
             │                   │
             └─────┬─────────────┘
                   │
    ┌──────────────┴──────────────┐
    ▼                             ▼
┌─────────────────┐      ┌──────────────────┐
│  LLM Callers    │      │  Library API     │
│  (src/llm/)     │      │  (src/index.ts)  │
│                 │      │                  │
│ - anthropic     │      │ resolveToken     │
│   -call.ts      │      │ callAnthropic    │
│ - codex-call.ts │      │ callCodex        │
│                 │      │ + types          │
└─────────────────┘      └──────────────────┘
    │                         │
    └────────────┬────────────┘
                 │
            Used by:
         - CLI (run command)
         - External projects
         - Tests
```

---

## Module Map

### Core Modules

| Module | Purpose | Key Exports | Lines | Tests |
|--------|---------|-------------|-------|-------|
| **src/cli.ts** | CLI entry point, command handlers | program, commands | 189 | cli-integration.test.ts |
| **src/index.ts** | Public library API | resolveToken, callAnthropic, callCodex, types | 44 | (integration) |
| **src/config.ts** | Store path resolution | getStoreDir(), getStorePath() | 28 | (indirect) |

### Authentication Modules (src/auth/)

| Module | Purpose | Key Exports | Lines | Tests |
|--------|---------|-------------|-------|-------|
| **types.ts** | Data structures | TokenCredential, OAuthCredential, AuthProfileStore | 40 | (schemas) |
| **store.ts** | Persist credentials to disk | loadStore(), saveStore(), upsertProfile(), removeProfile() | ~150 | store.test.ts |
| **resolve.ts** | Token resolution + OAuth refresh | resolveToken() | ~100 | resolve.test.ts |
| **anthropic.ts** | Anthropic login (paste token) | loginAnthropic(), ANTHROPIC_PROFILE_ID | ~50 | (integration) |
| **codex.ts** | OpenAI Codex PKCE OAuth | loginCodex(), CODEX_PROFILE_ID | ~80 | (integration) |

### LLM Call Modules (src/llm/)

| Module | Purpose | Key Exports | Lines | Tests |
|--------|---------|-------------|-------|-------|
| **anthropic-call.ts** | Claude API via SDK | callAnthropic(), types | ~80 | (integration) |
| **codex-call.ts** | GPT-4o via Codex endpoint (SSE) | callCodex(), types | ~150 | codex-call.test.ts |

### Test Files (test/)

| File | Coverage | Focus |
|------|----------|-------|
| **store.test.ts** | loadStore, saveStore, profiles | JSON I/O, schema validation |
| **resolve.test.ts** | resolveToken, OAuth refresh | Token resolution, auto-refresh |
| **codex-call.test.ts** | callCodex, SSE parsing | Headers, body, streaming response |
| **cli-integration.test.ts** | Full CLI flow | E2E: login, status, run commands |

---

## Data Flow

### 1. Authentication Flow (Login)

```
User runs: auth-agent auth login --provider anthropic
│
├─→ cli.ts (auth login action)
│
└─→ auth/anthropic.ts (loginAnthropic)
    ├─ Prompt user for sk-ant-oat-... token
    ├─ Create TokenCredential object
    │  {
    │    type: "token",
    │    provider: "anthropic",
    │    token: "sk-ant-oat-...",
    │    expires: undefined (no expiry)
    │  }
    │
    └─→ auth/store.ts (upsertAndSave)
        ├─ Load current store from ~/.auth-agent/auth-profiles.json
        ├─ Add/update credential in profiles map
        ├─ Write back to disk with mode 0600
        │
        └─→ File system: ~/.auth-agent/auth-profiles.json
            {
              "version": 1,
              "profiles": {
                "anthropic:subscription": { /* credential */ }
              }
            }
```

### 2. Token Resolution & Auto-Refresh

```
User runs: auth-agent run "Hello" --provider anthropic
│
├─→ cli.ts (run action)
│
└─→ auth/resolve.ts (resolveToken)
    │
    ├─ Load store from disk
    ├─ Get credential by provider
    │
    ├─ If type === "token":
    │  ├─ Check if expired
    │  └─ Return token (no refresh)
    │
    └─ If type === "oauth":
       ├─ Check if token is expired
       ├─ If yes, call OAuth refresh endpoint
       │  └─ Save new access token to store
       └─ Return current/refreshed token
```

### 3. API Call Flow (Anthropic)

```
cli.ts (run action with --provider anthropic)
│
├─→ resolveToken("anthropic")
│   └─ Returns: { token: "sk-ant-oat-...", provider: "anthropic" }
│
└─→ llm/anthropic-call.ts (callAnthropic)
    ├─ Create request:
    │  POST /v1/messages
    │  Headers:
    │    - Authorization: Bearer sk-ant-oat-...
    │    - anthropic-version: 2023-06-01
    │    - content-type: application/json
    │  Body:
    │    {
    │      model: "claude-sonnet-4-5",
    │      max_tokens: 1024,
    │      messages: [{ role: "user", content: "Hello" }]
    │    }
    │
    └─→ @anthropic-ai/sdk
        └─→ api.anthropic.com
            ├─ Validates token
            ├─ Runs model
            └─ Returns: { content: [...], usage: {...} }
```

### 4. API Call Flow (OpenAI Codex)

```
cli.ts (run action with --provider openai-codex)
│
├─→ resolveToken("openai-codex")
│   └─ Returns: { token: "eyJ...", accountId: "user_...", provider: "openai-codex" }
│
└─→ llm/codex-call.ts (callCodex)
    ├─ Create request:
    │  POST /api/chat/completions
    │  Headers:
    │    - Authorization: Bearer eyJ...
    │    - Content-Type: application/json
    │  Body:
    │    {
    │      model: "gpt-5-codex-1",
    │      messages: [{ role: "user", content: "Hello" }],
    │      stream: true
    │    }
    │
    ├─ Receive streaming response (Server-Sent Events)
    │  data: {"delta":{"content":"Hello"}}
    │  data: {"delta":{"content":" world"}}
    │  data: [DONE]
    │
    └─→ Parse & accumulate SSE chunks
        └─ Return full text: "Hello world"
```

### 5. Library Usage Flow (External Project)

```
External project: npm install auth-agent
│
├─→ import { resolveToken, callAnthropic } from "auth-agent"
│
└─→ User code:
    const { token } = await resolveToken("anthropic");
    const result = await callAnthropic({
      token,
      model: "claude-sonnet-4-5",
      prompt: "Explain OAuth"
    });
    console.log(result.text);
    │
    └─→ Reads from user's ~/.auth-agent/auth-profiles.json
        (User must have run: auth-agent auth login --provider anthropic)
```

---

## Key Exports

### Public Library API (src/index.ts)

```typescript
// Token resolution (handles OAuth refresh transparently)
export { resolveToken } from "./auth/resolve.js";
export type { Provider, ResolvedToken } from "./auth/resolve.js";

// Credential types
export type {
  AuthProfileStore,
  AuthProfileCredential,
  TokenCredential,
  OAuthCredential,
} from "./auth/types.js";

// Store access (advanced)
export { loadStore, getProfile } from "./auth/store.js";

// LLM callers
export { callAnthropic } from "./llm/anthropic-call.js";
export type { AnthropicCallOptions, AnthropicCallResult } from "./llm/anthropic-call.js";

export { callCodex } from "./llm/codex-call.js";
export type { CodexCallOptions, CodexCallResult } from "./llm/codex-call.js";

// Profile ID constants
export { ANTHROPIC_PROFILE_ID } from "./auth/anthropic.js";
export { CODEX_PROFILE_ID } from "./auth/codex.js";
```

### CLI Commands (src/cli.ts)

```bash
auth-agent auth login --provider <provider>        # Save credentials
auth-agent auth status                             # Show saved credentials
auth-agent auth remove --provider <provider>       # Delete credentials
auth-agent run <prompt> --provider <provider> [--model <model>] [--max-tokens <n>]
```

---

## Dependencies

### External Dependencies

| Package | Version | Purpose | Used By |
|---------|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.52.0 | Claude API client | llm/anthropic-call.ts |
| `@mariozechner/pi-ai` | ^0.57.1 | OAuth & utilities | auth/codex.ts |
| `commander` | ^12.0.0 | CLI framework | cli.ts |
| `open` | ^10.0.0 | Open browser for OAuth | auth/codex.ts |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/node` | ^22.0.0 | Node.js type definitions |
| `typescript` | ^5.4.0 | TypeScript compiler |
| `tsx` | ^4.0.0 | TypeScript executor (for npm run dev) |
| `vitest` | ^1.6.0 | Test runner |

### Internal Dependencies

```
src/cli.ts
├─ auth/anthropic.ts
├─ auth/codex.ts
├─ auth/resolve.ts
├─ auth/store.ts
├─ llm/anthropic-call.ts
└─ llm/codex-call.ts

src/index.ts
├─ auth/resolve.ts
├─ auth/types.ts
├─ auth/store.ts
├─ auth/anthropic.ts
├─ auth/codex.ts
├─ llm/anthropic-call.ts
└─ llm/codex-call.ts

auth/resolve.ts
├─ auth/store.ts
├─ auth/types.ts
├─ @mariozechner/pi-ai (OAuth)
└─ fetch (global, mocked in tests)

auth/store.ts
├─ config.ts
├─ auth/types.ts
└─ node:fs, node:path (file I/O)

llm/anthropic-call.ts
├─ @anthropic-ai/sdk
└─ auth/types.ts (for response types)

llm/codex-call.ts
├─ fetch (global, SSE)
└─ auth/types.ts (for response types)
```

---

## Testing Strategy

### Test Isolation Patterns

#### Credential Store Isolation

Each test runs with a unique temporary directory to avoid corrupting user credentials:

```typescript
beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-agent-test-"));
  process.env.AUTH_AGENT_STORE_DIR = tmpDir;
});

// Now loadStore() uses tmpDir, not ~/.auth-agent
```

#### Network Call Mocking

`fetch` is mocked globally to prevent real HTTP calls:

```typescript
beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

#### Module Mocking

External modules are mocked before importing code under test:

```typescript
vi.mock("@mariozechner/pi-ai/oauth", () => ({
  getOAuthApiKey: vi.fn(),
}));

const { resolveToken } = await import("../src/auth/resolve.js");
```

### Test Coverage

| Module | Coverage | Status |
|--------|----------|--------|
| src/auth/store.ts | ~95% | Fully tested |
| src/auth/resolve.ts | ~90% | Fully tested |
| src/llm/codex-call.ts | ~85% | Edge cases covered |
| src/cli.ts | ~80% | E2E integration |
| src/llm/anthropic-call.ts | ~70% | Uses SDK directly |

**Target:** ≥80% line/branch coverage on all new code

---

## Module Responsibilities

### auth/

Handles credential persistence and token resolution.

- **store.ts**: Read/write auth-profiles.json from disk
- **resolve.ts**: Get valid token, auto-refresh OAuth if needed
- **anthropic.ts**: Anthropic-specific login (paste token)
- **codex.ts**: OpenAI Codex-specific login (PKCE OAuth)
- **types.ts**: Credential data structures

### llm/

Handles API calls to LLM providers.

- **anthropic-call.ts**: Call Claude via @anthropic-ai/sdk
- **codex-call.ts**: Call GPT-4o via ChatGPT Codex endpoint (SSE streaming)

### cli.ts

Commander.js CLI that wires auth + llm modules together.

- Parses CLI arguments
- Calls auth modules (login, status, remove)
- Calls llm modules (run)
- Formats output for terminal

### index.ts

Public library API — re-exports selected modules for external projects.

---

## Adding Features

To add a new provider:

1. **Create auth module** — `src/auth/<provider>.ts`
   - Define `login<Provider>()` function
   - Define `<PROVIDER>_PROFILE_ID` constant
   - Use `upsertAndSave()` from store.ts

2. **Register in resolve.ts**
   - Add provider to `Provider` type
   - Add to `PROFILE_IDS` map
   - Handle token refresh logic

3. **Create LLM call helper** — `src/llm/<provider>-call.ts` (optional)
   - Export `call<Provider>()` function
   - Export `Call<Provider>Options` and `Call<Provider>Result` types

4. **Wire up CLI** — `src/cli.ts`
   - Add provider handling in `auth login`
   - Add provider handling in `run`

5. **Export public API** — `src/index.ts`
   - Add types and functions

6. **Write tests** — `test/<provider>-call.test.ts`
   - Unit tests with mocked fetch
   - Target ≥80% coverage

See [docs/CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-new-provider) for detailed example.

---

## Key Design Decisions

### 1. Immutable Credential Store

Store modifications return new objects rather than mutating. This prevents accidental data loss and makes testing easier.

```typescript
// ✓ CORRECT
const updated = upsertProfile(store, id, cred);
saveStore(updated);

// ✗ WRONG
store.profiles[id] = cred;
saveStore(store);
```

### 2. Transparent OAuth Auto-refresh

OAuth token refresh is handled inside `resolveToken()`. Callers don't need to worry about token expiry.

```typescript
// Token auto-refreshes if needed, no caller involvement required
const { token } = await resolveToken("openai-codex");
const result = await callCodex({ token, /* ... */ });
```

### 3. Provider-Agnostic Library API

The library exports generic functions that work with any provider:

```typescript
const { token } = await resolveToken(provider); // "anthropic" or "openai-codex"
```

This makes it easy to support multiple providers and add new ones.

### 4. Store Per Machine, Not Per User

Credentials are stored per machine at `~/.auth-agent/auth-profiles.json`. Multi-user setups can override with `AUTH_AGENT_STORE_DIR`.

This avoids complexity of shared storage while remaining flexible for CI/container environments.

---

**Last Updated:** 2026-03-09

For more details, see [README.md](../README.md), [CONTRIBUTING.md](./CONTRIBUTING.md), or [RUNBOOK.md](./RUNBOOK.md).
