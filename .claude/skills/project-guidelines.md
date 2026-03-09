# auth-agent Project Guidelines

A CLI tool and Node.js library that enables running AI agents using Claude Max or
ChatGPT Plus/Pro subscription credits — no paid API keys required. It manages OAuth
credentials locally and exposes them as both a CLI interface and a reusable library.

## When to Use This Skill

Reference this skill when working on the auth-agent project. It documents
architecture decisions, required code patterns, testing strategy, and release workflow.

---

## Architecture Overview

**Tech Stack:**
- **Language**: TypeScript 5.4+ (strict mode), ES modules (ESM)
- **Runtime**: Node.js 20+
- **CLI Framework**: commander ^12
- **AI SDKs**: @anthropic-ai/sdk ^0.52, @mariozechner/pi-ai (OAuth helper)
- **Testing**: Vitest ^1.6 (unit tests, no E2E framework)
- **Build**: tsc → dist/

**Providers:**

| Provider | Profile ID | Auth Type | Refresh |
|----------|-----------|-----------|---------|
| Anthropic Claude Max | `anthropic:subscription` | Static token (`sk-ant-oat-...`) | No |
| OpenAI Codex (ChatGPT+) | `openai-codex:subscription` | PKCE OAuth | Yes (auto) |

**Data Flow:**
```
CLI / Library consumer
        │
        ▼
  resolveToken(provider)          src/auth/resolve.ts
        │
        ├─ TokenCredential ──────► return token directly
        │
        └─ OAuthCredential
               │
               ├─ not expired ──► return access token
               └─ expired ──────► getOAuthApiKey() refresh → saveStore → return
                                  (@mariozechner/pi-ai)

  callAnthropic / callCodex       src/llm/
        │
        └─ uses resolved token to call AI API
```

**Credential Store:**
```
~/.auth-agent/auth-profiles.json   (default)
$XDG_CONFIG_HOME/auth-agent/       (XDG standard)
$AUTH_AGENT_STORE_DIR/             (env override)

Directory: 0o700   File: 0o600   (owner-only access)
```

---

## File Structure

```
auth-agent/
├── src/
│   ├── cli.ts              # Commander.js entry point (auth login/status/remove, run)
│   ├── config.ts           # Store path resolution (env > XDG > ~/.auth-agent)
│   ├── index.ts            # Public library exports (resolveToken, callAnthropic, callCodex)
│   ├── auth/
│   │   ├── types.ts        # TokenCredential, OAuthCredential, AuthProfileStore
│   │   ├── store.ts        # File I/O: loadStore, saveStore, upsertProfile, removeProfile
│   │   ├── anthropic.ts    # Anthropic setup-token login flow
│   │   ├── codex.ts        # OpenAI PKCE OAuth login + localhost:1455 callback
│   │   └── resolve.ts      # Token resolution + auto OAuth refresh
│   └── llm/
│       ├── anthropic-call.ts   # Claude API calls via @anthropic-ai/sdk
│       └── codex-call.ts       # ChatGPT Codex SSE streaming (Node https, proxy support)
├── test/
│   ├── store.test.ts       # Auth store read/write unit tests
│   ├── resolve.test.ts     # Token resolution + refresh tests
│   └── codex-call.test.ts  # Codex API headers, SSE parsing tests
├── dist/                   # Compiled JS + .d.ts (git-ignored, generated)
├── package.json
├── tsconfig.json           # target: ES2022, strict: true, moduleResolution: bundler
├── vitest.config.ts        # environment: node, pool: forks
├── README.md
└── CONTRIBUTING.md
```

---

## Critical Code Patterns

### 1. Immutable Store Operations

**ALWAYS** return new objects — never mutate in place.

```typescript
// src/auth/store.ts

// CORRECT: spread into new object
export function upsertProfile(
  store: AuthProfileStore,
  profileId: string,
  credential: AuthProfileCredential
): AuthProfileStore {
  return {
    ...store,
    profiles: { ...store.profiles, [profileId]: credential },
  };
}

// CORRECT: destructure to omit key
export function removeProfile(
  store: AuthProfileStore,
  profileId: string
): AuthProfileStore {
  const { [profileId]: _removed, ...rest } = store.profiles;
  return { ...store, profiles: rest };
}
```

### 2. Credential Type Definitions

All credentials live in `src/auth/types.ts`. Add new credential fields there first.

```typescript
type TokenCredential = {
  type: "token";
  provider: string;
  token: string;
  expires?: number;   // ms since epoch; undefined = never expires
  email?: string;
};

type OAuthCredential = {
  type: "oauth";
  provider: string;
  access: string;
  refresh: string;
  expires: number;    // ms since epoch; REQUIRED for OAuth
  accountId?: string;
  email?: string;
};

type AuthProfileStore = {
  version: 1;
  profiles: Record<string, AuthProfileCredential>;
};
```

### 3. Token Resolution Pattern

```typescript
// src/auth/resolve.ts
export async function resolveToken(provider: Provider): Promise<ResolvedToken> {
  const store = loadStore();
  const profileId = profileIdFor(provider);
  const cred = store.profiles[profileId];

  if (!cred) {
    throw new Error(
      `No credentials found for provider '${provider}'.\n` +
      `Run: auth-agent auth login --provider ${provider}`
    );
  }

  if (cred.type === "token") {
    if (cred.expires && Date.now() > cred.expires) {
      throw new Error("Token has expired. Please run login again.");
    }
    return { token: cred.token, provider: cred.provider };
  }

  // OAuth: auto-refresh if expired
  if (Date.now() >= cred.expires) {
    const refreshed = await getOAuthApiKey(provider, { ...cred });
    const updatedStore = upsertProfile(store, profileId, refreshed);
    saveStore(updatedStore);
    return { token: refreshed.access, provider };
  }

  return { token: cred.access, provider };
}
```

### 4. Anthropic LLM Call (Subscription Mode)

Use `authToken` header — NOT `apiKey`. This bypasses normal API billing.

```typescript
// src/llm/anthropic-call.ts
const client = new Anthropic({
  authToken: token,
  defaultHeaders: {
    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
  },
});

const response = await client.messages.create({
  model,                          // default: "claude-sonnet-4-5"
  max_tokens: maxTokens,
  messages: [{ role: "user", content: prompt }],
});
```

### 5. OpenAI Codex Call (SSE, Proxy-Aware)

Use Node.js `https` module (not `fetch`) for proxy support. Stream SSE events manually.

```typescript
// src/llm/codex-call.ts
// Endpoint: https://chatgpt.com/backend-api/codex/responses
// Required headers: authorization, chatgpt-account-id, openai-beta
// Parse SSE: split on "\n\n", extract `data:` lines, JSON.parse, handle [DONE]
```

### 6. Error Handling — Always Actionable

Never silently swallow errors. Always include the next step.

```typescript
// CORRECT
throw new Error(
  `No credentials for '${provider}'.\nRun: auth-agent auth login --provider ${provider}`
);

// WRONG
throw new Error("No credentials");  // no guidance for the user
```

### 7. CLI Command Registration

Add new commands in `src/cli.ts` using Commander.js chained API.

```typescript
program
  .command("my-command <arg>")
  .description("Short description")
  .option("--flag <value>", "Flag description")
  .action(async (arg, options) => {
    // async action handler
  });
```

---

## Testing Requirements

**Framework:** Vitest, environment: node, pool: forks

**Minimum coverage:** 80%

### Test File Conventions

- Location: `test/*.test.ts`
- Naming: mirrors `src/` path, e.g., `src/auth/store.ts` → `test/store.test.ts`
- Use `vi.mock()` BEFORE any imports that depend on the mocked module
- Isolate store tests using `AUTH_AGENT_STORE_DIR` env var pointing to a temp dir

### Running Tests

```bash
npm test                          # run all tests once
npm run test -- --watch           # watch mode
npm run test -- --coverage        # with coverage report
```

### Test Patterns

```typescript
// test/store.test.ts — isolated temp dir
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "auth-agent-test-"));
process.env.AUTH_AGENT_STORE_DIR = tempDir;

// Import AFTER setting env
const { loadStore, saveStore } = await import("../src/auth/store.js");

// test/resolve.test.ts — mock OAuth library
vi.mock("@mariozechner/pi-ai/oauth", () => ({
  getOAuthApiKey: vi.fn(),
}));

// test/codex-call.test.ts — SSE stream helper
function buildSseStream(events: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
```

---

## Build & Release

### Build

```bash
npm run build       # tsc → dist/ (ESM JS + .d.ts + source maps)
```

Output structure mirrors `src/`:
```
dist/
├── cli.js / cli.d.ts
├── index.js / index.d.ts
├── auth/*.js / *.d.ts
└── llm/*.js / *.d.ts
```

### Pre-Publish Checklist

- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all tests green)
- [ ] No hardcoded credentials or tokens
- [ ] `version` bumped in `package.json` (semver)
- [ ] `README.md` updated if API surface changed
- [ ] `CHANGELOG` entry added

### Publish

```bash
npm publish    # triggers prepublishOnly: build + test
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_AGENT_STORE_DIR` | `~/.auth-agent/` | Override credential store directory |
| `XDG_CONFIG_HOME` | `~/.config/` | XDG base dir (standard fallback) |

No `.env` file — this is a CLI tool, not a server. Configuration via env vars only.

---

## Code Quality Rules

1. **Immutability** — never mutate objects or arrays; always return new copies
2. **No silent errors** — every error must include actionable next steps
3. **TypeScript strict mode** — no `any`, no implicit returns, explicit types on all exports
4. **File size** — 200-400 lines typical, 800 max; split by feature, not by type
5. **No console.log in library code** — CLI uses `console.log`/`console.error`; library throws
6. **ESM only** — all imports use `.js` extension (even for `.ts` source files)
7. **No hardcoded secrets** — credentials always flow through `resolveToken()`
8. **TDD workflow** — write tests first (RED), implement (GREEN), refactor (IMPROVE)

---

## Public API (Library Usage)

Exported from `src/index.ts`:

```typescript
import { resolveToken, callAnthropic, callCodex } from "auth-agent";

// Resolve a credential token for a provider
const { token } = await resolveToken("anthropic");

// Call Claude
const result = await callAnthropic({
  provider: "anthropic",
  prompt: "Hello, world!",
  model: "claude-sonnet-4-5",      // optional
  maxTokens: 1024,                  // optional
});

// Call ChatGPT Codex
const result = await callCodex({
  provider: "openai-codex",
  prompt: "Hello, world!",
  model: "gpt-5.1-codex-mini",     // optional
  maxTokens: 1024,                  // optional
  proxy: "http://proxy:8080",      // optional, for restricted networks
});
```

---

## Adding a New Provider

1. Add credential type (if different) to `src/auth/types.ts`
2. Add `profileIdFor()` mapping in `src/auth/resolve.ts`
3. Create `src/auth/<provider>.ts` for login flow
4. Create `src/llm/<provider>-call.ts` for LLM call
5. Register `auth login --provider <new>` in `src/cli.ts`
6. Export from `src/index.ts`
7. Write tests in `test/<provider>-*.test.ts`
8. Update `README.md` with new provider docs

---

## Related Skills

- `coding-standards` — TypeScript/Node.js best practices
- `tdd-workflow` — TDD methodology (RED → GREEN → REFACTOR)
- `security-review` — credential handling, secrets management
- `api-design` — if exposing HTTP endpoints in the future
