# Contributing to auth-agent

Thank you for your interest in contributing! This guide covers how to set up
a development environment, run tests, and submit changes.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Conventions](#project-conventions)
- [Testing](#testing)
- [Adding a New Provider](#adding-a-new-provider)
- [Pull Request Checklist](#pull-request-checklist)

---

## Development Setup

### Prerequisites

- Node.js ≥ 20.0.0
- npm ≥ 10

### Install

```bash
git clone https://github.com/you/auth-agent.git
cd auth-agent
npm install
```

### Run the CLI from source (no build step)

```bash
npm run dev -- auth status
npm run dev -- run "Hello" --provider anthropic
```

This uses `tsx` to execute TypeScript directly, so changes to `src/` are
reflected immediately.

### Build

```bash
npm run build
# Outputs: dist/ (JS + .d.ts declarations + source maps)
```

---

## Project Conventions

### File organisation

- Keep files focused: **one responsibility per file**, 200–400 lines typical.
- Organise by **feature** (`auth/`, `llm/`), not by type.

### Immutability

All data structures — especially the credential store — are treated as
**immutable**. Functions return new objects rather than mutating existing ones.

```typescript
// ✓ correct
const updated = upsertProfile(store, profileId, credential);

// ✗ wrong
store.profiles[profileId] = credential;
```

### Error handling

- **Never** silently swallow errors.
- Throw with descriptive messages that include the actionable next step
  (e.g. `"Run: auth-agent auth login --provider anthropic"`).
- At system boundaries (file I/O, network), catch and re-throw with context.

### TypeScript

- Strict mode is enabled (`"strict": true` in `tsconfig.json`).
- Prefer explicit return types on exported functions.
- Avoid `any`; use `unknown` and narrow explicitly.

---

## Testing

The test suite uses [Vitest](https://vitest.dev/).

### Run tests

```bash
npm test                              # run all tests once
npm run test:watch                    # watch mode
npm test test/codex-call.test.ts      # single file
```

### Testing philosophy: TDD

1. **RED** — Write the failing test first.
2. **GREEN** — Write the minimal implementation to make it pass.
3. **REFACTOR** — Clean up; verify coverage ≥ 80 %.

### Mocking patterns

**Global `fetch`** — stub with `vi.stubGlobal` and restore in `afterEach`:

```typescript
import { afterEach, beforeEach, vi } from "vitest";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

**External modules** — use `vi.mock` before dynamic imports:

```typescript
vi.mock("@mariozechner/pi-ai/oauth", () => ({
  getOAuthApiKey: vi.fn(),
}));

const { resolveToken } = await import("../src/auth/resolve.js");
```

**Credential store isolation** — set `AUTH_AGENT_STORE_DIR` to a `tmpdir`
_before_ importing any store module:

```typescript
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-agent-test-"));
process.env.AUTH_AGENT_STORE_DIR = tmpDir;

const { loadStore } = await import("../src/auth/store.js");
```

### Coverage target

Maintain **≥ 80 %** line/branch coverage on all new code.

---

## Adding a New Provider

1. **Create `src/auth/<provider>.ts`**
   - Export a `login<Provider>()` function and a `<PROVIDER>_PROFILE_ID` constant.
   - Save credentials via `upsertAndSave()` from `store.ts`.

2. **Register in `src/auth/resolve.ts`**
   - Add the new provider to `Provider` type and `PROFILE_IDS` map.

3. **Add an LLM call helper in `src/llm/<provider>-call.ts`** *(optional)*
   - Export `call<Provider>(options)`.
   - Export `Call<Provider>Options` and `Call<Provider>Result` types.

4. **Wire up the CLI in `src/cli.ts`**
   - Add a branch to `auth login` and `run` actions.

5. **Export from `src/index.ts`**
   - Add the new types and functions to the public library API.

6. **Write tests**
   - `test/<provider>-call.test.ts` — unit-test pure helpers with mocked fetch.

---

## Pull Request Checklist

Before opening a PR, verify:

- [ ] `npm run build` completes without TypeScript errors
- [ ] `npm test` passes (all tests green)
- [ ] New code has ≥ 80 % test coverage
- [ ] No hardcoded secrets or tokens
- [ ] Errors are handled and never silently swallowed
- [ ] New public exports are added to `src/index.ts` and documented in `README.md`
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
