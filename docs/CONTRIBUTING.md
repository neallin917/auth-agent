# Contributing to auth-agent

Thank you for your interest in contributing to auth-agent! This guide covers development setup, testing patterns, and the pull request process.

**Last Updated:** 2026-03-09

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Available Commands](#available-commands)
- [Testing Strategy](#testing-strategy)
- [Code Conventions](#code-conventions)
- [Adding a New Provider](#adding-a-new-provider)
- [Pull Request Checklist](#pull-request-checklist)

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 20.0.0 | Runtime |
| npm | ≥ 10 | Package manager |
| TypeScript | 5.4.0 | Type checking |
| Vitest | 1.6.0 | Test runner |
| tsx | 4.0.0 | TypeScript execution |

### Clone and Install

```bash
git clone https://github.com/you/auth-agent.git
cd auth-agent
npm install
```

### Run CLI from Source (Watch Mode)

For rapid development iterations, use `npm run dev` to execute TypeScript directly without compilation:

```bash
npm run dev -- auth status
npm run dev -- auth login --provider anthropic
npm run dev -- run "Explain OAuth" --provider anthropic
```

Changes to `src/` take effect immediately—no rebuild required.

### Build for Distribution

When you're ready to test the built version:

```bash
npm run build
# Output: dist/ (JavaScript + .d.ts type declarations + source maps)
```

Then test the built CLI:

```bash
./dist/cli.js auth status
./dist/cli.js run "Hello" --provider anthropic
```

---

## Project Structure

```
auth-agent/
├── src/
│   ├── cli.ts                    Commander.js CLI definitions + action handlers
│   ├── index.ts                  Public library exports
│   ├── config.ts                 Credential store path resolution
│   ├── auth/
│   │   ├── types.ts              Credential data structures (TokenCredential, OAuthCredential)
│   │   ├── store.ts              Load/save auth-profiles.json
│   │   ├── anthropic.ts          Anthropic login flow (paste setup-token)
│   │   ├── codex.ts              OpenAI Codex login flow (PKCE OAuth)
│   │   └── resolve.ts            Token resolution + OAuth token auto-refresh
│   └── llm/
│       ├── anthropic-call.ts     Claude API call via @anthropic-ai/sdk
│       └── codex-call.ts         GPT-4o call via ChatGPT Codex endpoint (SSE)
├── test/
│   ├── store.test.ts             Store read/write unit tests
│   ├── resolve.test.ts           Token resolution + OAuth refresh tests
│   ├── codex-call.test.ts        Codex headers, body, SSE parsing
│   └── cli-integration.test.ts   E2E CLI integration tests
├── dist/                         Compiled JavaScript (created by npm run build)
├── package.json                  NPM metadata + dependencies
├── tsconfig.json                 TypeScript compiler config (strict mode enabled)
├── vitest.config.ts              Vitest test runner config
├── README.md                      User-facing documentation
└── CONTRIBUTING.md               Quick reference for contributors
```

### Key Design Patterns

#### Immutable Credential Store

All store modifications return a **new object** — never mutate in place:

```typescript
// ✓ CORRECT
const updated = upsertProfile(store, "anthropic:subscription", newCred);
saveStore(updated);

// ✗ WRONG (mutation)
store.profiles["anthropic:subscription"] = newCred;
saveStore(store);
```

#### Error Handling with Context

Always throw errors with actionable next steps, especially at system boundaries:

```typescript
// ✓ GOOD
throw new Error(
  "No credentials found for anthropic. Run: auth-agent auth login --provider anthropic"
);

// ✗ BAD (silent failure, no context)
if (!cred) return null;
```

#### Type Safety

- Strict mode enabled in `tsconfig.json`
- Exported functions have explicit return types
- Use `unknown` and type narrowing instead of `any`

---

## Available Commands

<!-- AUTO-GENERATED from package.json scripts -->

### Development

```bash
npm run dev -- <command>     # Run CLI directly from source (tsx, no build)
npm run build                # Compile TypeScript → dist/
npm run watch                # Watch mode for compilation (if available)
```

### Testing

```bash
npm test                                # Run full test suite once
npm run test:watch                      # Watch mode
npm test test/store.test.ts             # Single file
npm test -- --reporter=verbose          # Detailed output
npm test -- --reporter=html             # HTML report (check coverage/)
```

### Publishing

```bash
npm run prepublishOnly       # Runs: build + test (automatic before npm publish)
npm publish                  # Publish to npm registry (requires npm account)
```

### Manual Test Scenarios

```bash
# Anthropic (setup-token from claude CLI)
npm run dev -- auth login --provider anthropic
npm run dev -- auth status
npm run dev -- run "Hello!" --provider anthropic

# OpenAI Codex (OAuth via browser)
npm run dev -- auth login --provider openai-codex
npm run dev -- auth status
npm run dev -- run "What is 2+2?" --provider openai-codex
```

---

## Testing Strategy

### Philosophy: TDD (Test-Driven Development)

1. **RED** — Write a failing test first
2. **GREEN** — Write minimal code to make it pass
3. **REFACTOR** — Clean up; verify coverage ≥ 80%

### Test Structure

All tests use **Vitest**. Test isolation is critical — each test runs in a clean environment.

#### Testing the Credential Store

Use a temporary directory to avoid corrupting the user's actual store:

```typescript
import os from "node:os";
import path from "node:path";
import { beforeEach } from "vitest";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-agent-test-"));
  process.env.AUTH_AGENT_STORE_DIR = tmpDir;
});

// Now loadStore() will use tmpDir instead of ~/.auth-agent
```

#### Testing Network Calls (HTTP)

Mock `fetch` using `vi.stubGlobal`:

```typescript
import { vi, beforeEach, afterEach } from "vitest";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("calls API with correct headers", () => {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ result: "ok" }), { status: 200 })
  );

  await callAnthropic({ token: "sk-...", model: "...", prompt: "..." });

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("api.anthropic.com"),
    expect.objectContaining({
      headers: expect.objectContaining({
        "Authorization": "Bearer sk-...",
      }),
    })
  );
});
```

#### Testing External Module Imports

Mock modules before importing the code under test:

```typescript
import { vi, beforeEach } from "vitest";

beforeEach(async () => {
  vi.mock("@mariozechner/pi-ai/oauth", () => ({
    getOAuthApiKey: vi.fn().mockResolvedValue("test-key"),
  }));
});

const { resolveToken } = await import("../src/auth/resolve.js");
```

### Coverage Target

Maintain **≥ 80%** line/branch coverage on all new code.

```bash
npm test -- --coverage
```

---

## Code Conventions

### File Size and Responsibility

- **Max 800 lines per file** (typical: 200-400 lines)
- **One responsibility per file** — auth logic separate from CLI logic
- **Organize by feature** (`auth/`, `llm/`) not by type

### TypeScript Practices

```typescript
// ✓ Explicit return types on exports
export function resolveToken(provider: Provider): Promise<ResolvedToken> {
  // ...
}

// ✗ Omitting return types
export async function resolveToken(provider) {
  // ...
}

// ✓ Use unknown for external data
async function parseResponse(data: unknown): ParsedResponse {
  if (typeof data !== "object" || !data) {
    throw new Error("Invalid response");
  }
  // ...
}
```

### Error Messages

Errors should be **actionable** and include the command users should run:

```typescript
throw new Error(
  `No stored credentials for provider "${provider}". ` +
  `Run: auth-agent auth login --provider ${provider}`
);
```

### Async/Await

Always use modern async/await syntax. Avoid callback chains.

```typescript
// ✓ GOOD
const response = await fetch(url);
const data = await response.json();

// ✗ BAD
fetch(url).then((r) => r.json()).then((d) => { /* ... */ });
```

---

## Adding a New Provider

To add support for a new AI provider (e.g., "google-cloud"):

### 1. Create Authentication Module

**`src/auth/google-cloud.ts`:**

```typescript
import { loadStore, upsertAndSave } from "./store.js";

export const GOOGLE_CLOUD_PROFILE_ID = "google-cloud:subscription";

export async function loginGoogleCloud(): Promise<void> {
  console.log("Paste your Google Cloud API key:");
  const apiKey = await prompt(); // or use readline for CLI

  const cred = {
    type: "token" as const,
    provider: "google-cloud",
    token: apiKey,
  };

  upsertAndSave(GOOGLE_CLOUD_PROFILE_ID, cred);
  console.log("✓ Credentials saved");
}
```

### 2. Register in Token Resolution

**`src/auth/resolve.ts`** — add to `Provider` type and `PROFILE_IDS` map:

```typescript
export type Provider = "anthropic" | "openai-codex" | "google-cloud";

const PROFILE_IDS: Record<Provider, string> = {
  anthropic: ANTHROPIC_PROFILE_ID,
  "openai-codex": CODEX_PROFILE_ID,
  "google-cloud": GOOGLE_CLOUD_PROFILE_ID,
};
```

### 3. Create LLM Call Helper (Optional)

**`src/llm/google-cloud-call.ts`:**

```typescript
export type GoogleCloudCallOptions = {
  token: string;
  model: string;
  prompt: string;
  maxTokens?: number;
};

export type GoogleCloudCallResult = {
  text: string;
  model: string;
};

export async function callGoogleCloud(
  options: GoogleCloudCallOptions
): Promise<GoogleCloudCallResult> {
  // Implementation
}
```

### 4. Wire Up CLI

**`src/cli.ts`** — add provider handling in `auth login` and `run`:

```typescript
if (provider === "google-cloud") {
  await loginGoogleCloud();
} else if (provider === "openai-codex") {
  // ...
}
```

### 5. Export Public API

**`src/index.ts`:**

```typescript
export { callGoogleCloud } from "./llm/google-cloud-call.js";
export type { GoogleCloudCallOptions, GoogleCloudCallResult } from "./llm/google-cloud-call.js";
export { GOOGLE_CLOUD_PROFILE_ID } from "./auth/google-cloud.js";
```

### 6. Write Tests

**`test/google-cloud-call.test.ts`:**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("callGoogleCloud", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls Google Cloud API with correct headers", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "Hello" }), { status: 200 })
    );

    const result = await callGoogleCloud({
      token: "test-key",
      model: "gemini-pro",
      prompt: "Hello!",
    });

    expect(result.text).toBe("Hello");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("googleapis.com"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Authorization": "Bearer test-key",
        }),
      })
    );
  });
});
```

### 7. Update Documentation

- Update `README.md` with provider-specific quick start
- Add to CLI reference table
- Document any special setup steps

---

## Pull Request Checklist

Before opening a PR, verify:

- [ ] Code is clean and readable
  - [ ] No debug `console.log()` statements
  - [ ] Function names are clear and descriptive
  - [ ] Comments explain "why", not "what"

- [ ] TypeScript checks pass
  - [ ] `npm run build` succeeds with no errors
  - [ ] No use of `any` (use `unknown` and type narrowing)
  - [ ] All exported functions have explicit return types

- [ ] Tests pass and provide coverage
  - [ ] `npm test` passes (all tests green)
  - [ ] New code has ≥ 80% coverage
  - [ ] Tests use proper isolation (tmpdir, mocked fetch, etc.)

- [ ] Security and errors
  - [ ] No hardcoded secrets or tokens
  - [ ] No credentials logged to console
  - [ ] Errors are handled and never silently swallowed
  - [ ] Error messages are actionable

- [ ] Documentation
  - [ ] New public exports added to `src/index.ts`
  - [ ] New CLI commands documented in README.md
  - [ ] Code examples compile/run successfully
  - [ ] Docstrings updated for changed functions

- [ ] Commits follow Conventional Commits format
  - [ ] Use prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
  - [ ] Examples:
    - `feat: add Google Cloud provider`
    - `fix: handle expired OAuth tokens gracefully`
    - `test: add coverage for store.ts`
    - `docs: update README with new provider example`

### PR Description Template

```markdown
## Summary

[1-2 sentence description of changes]

## Changes

- [Specific change 1]
- [Specific change 2]

## Testing

- [x] Ran `npm test` — all tests pass
- [x] Ran `npm run build` — no errors
- [x] Coverage: 85%+ on new code
- [x] Tested CLI: `npm run dev -- auth status`

## Checklist

- [ ] No hardcoded secrets
- [ ] Error handling in place
- [ ] Tests added for new code
- [ ] README updated (if needed)
```

---

## Resources

- **TypeScript**: https://www.typescriptlang.org/
- **Vitest**: https://vitest.dev/
- **Commander.js** (CLI): https://github.com/tj/commander.js
- **Anthropic SDK**: https://github.com/anthropics/anthropic-sdk-python
- **Node.js Best Practices**: https://nodejs.org/en/docs/guides/nodejs-best-practices/
- **Conventional Commits**: https://www.conventionalcommits.org/

---

**Questions?** Open an issue on GitHub or check the main [README.md](../README.md).
