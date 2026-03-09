# auth-agent Documentation Index

**Last Updated:** 2026-03-09

Complete guide to all documentation for the auth-agent project.

---

## Quick Navigation

### For Users

Start here if you're using auth-agent as a CLI tool or library:

1. **[../README.md](../README.md)** — Installation, quick start, CLI reference, library API
   - 483 lines | Covers setup, commands, configuration, environment variables

### For Contributors

Start here if you're contributing code:

1. **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Development setup, testing patterns, adding providers
   - 551 lines | Complete contributor guide with code examples and PR checklist

2. **[CODEMAPS.md](./CODEMAPS.md)** — Architecture, module map, data flows
   - 524 lines | Deep technical documentation of codebase structure

### For Operations/DevOps

Start here if you're deploying or troubleshooting:

1. **[RUNBOOK.md](./RUNBOOK.md)** — Deployment, health checks, troubleshooting, emergency procedures
   - 651 lines | Production operations guide with diagnostic commands

---

## Documentation Files

### README.md (Main Documentation)

**Purpose:** User-facing documentation

**Contents:**
- Prerequisites and installation
- Quick start guides (Anthropic & OpenAI)
- CLI reference with examples
- Library API reference
- Configuration & environment variables
- Development setup
- Contributing guide

**When to read:** Starting with auth-agent, unsure how to use it

**Key sections:**
- [Quick Start](../README.md#quick-start)
- [CLI Reference](../README.md#cli-reference)
- [Library Usage](../README.md#library-usage)

---

### docs/CONTRIBUTING.md (Development Guide)

**Purpose:** Guide for code contributors

**Contents:**
- Development setup (prerequisites, install, build)
- Project structure and file organization
- Available commands and scripts
- Testing strategy and mocking patterns
- Code conventions and best practices
- Step-by-step guide to adding new providers
- Pull request checklist and templates

**When to read:** Contributing code, implementing new features, writing tests

**Key sections:**
- [Development Setup](./CONTRIBUTING.md#development-setup)
- [Project Structure](./CONTRIBUTING.md#project-structure)
- [Testing Strategy](./CONTRIBUTING.md#testing-strategy)
- [Adding a New Provider](./CONTRIBUTING.md#adding-a-new-provider)

---

### docs/CODEMAPS.md (Architecture Reference)

**Purpose:** Technical deep-dive into codebase structure

**Contents:**
- Architecture overview with diagrams
- Complete module map with dependencies
- Data flow diagrams for all major flows
- Key exports and public API
- External and internal dependencies
- Testing strategy and coverage
- Design decisions and rationale

**When to read:** Understanding codebase internals, optimizing, debugging complex flows

**Key sections:**
- [Architecture Overview](./CODEMAPS.md#architecture-overview)
- [Module Map](./CODEMAPS.md#module-map)
- [Data Flow](./CODEMAPS.md#data-flow)
- [Key Exports](./CODEMAPS.md#key-exports)

---

### docs/RUNBOOK.md (Operations Guide)

**Purpose:** Production deployment and troubleshooting

**Contents:**
- Deployment procedures and checklists
- CI/CD integration examples
- Monitoring and health checks
- Comprehensive troubleshooting guide
- Credential store management
- Environment configuration
- Emergency procedures and recovery
- Regular maintenance tasks

**When to read:** Deploying to production, troubleshooting issues, managing credentials

**Key sections:**
- [Deployment](./RUNBOOK.md#deployment)
- [Troubleshooting](./RUNBOOK.md#troubleshooting)
- [Emergency Procedures](./RUNBOOK.md#emergency-procedures)
- [Credential Store Management](./RUNBOOK.md#credential-store-management)

---

## Documentation Coverage

| Area | Coverage | Status |
|------|----------|--------|
| Installation & Setup | README.md | Complete |
| CLI Reference | README.md, CONTRIBUTING.md | Complete |
| Library API | README.md | Complete |
| Configuration | README.md, RUNBOOK.md | Complete |
| Development | CONTRIBUTING.md | Complete |
| Architecture | CODEMAPS.md | Complete |
| Testing | CONTRIBUTING.md, CODEMAPS.md | Complete |
| Operations | RUNBOOK.md | Complete |
| Troubleshooting | RUNBOOK.md | Complete |
| Adding Features | CONTRIBUTING.md, CODEMAPS.md | Complete |

---

## File Organization

```
auth-agent/
├── docs/
│   ├── INDEX.md                 ← You are here
│   ├── CONTRIBUTING.md          Development guide
│   ├── CODEMAPS.md              Architecture reference
│   └── RUNBOOK.md               Operations guide
├── README.md                    User-facing documentation (main)
├── CONTRIBUTING.md              Quick reference (links to docs/CONTRIBUTING.md)
├── src/
│   ├── cli.ts                   CLI entry point
│   ├── index.ts                 Public library API
│   ├── config.ts                Configuration
│   ├── auth/                    Authentication modules
│   │   ├── types.ts
│   │   ├── store.ts
│   │   ├── resolve.ts
│   │   ├── anthropic.ts
│   │   └── codex.ts
│   └── llm/                     LLM call modules
│       ├── anthropic-call.ts
│       └── codex-call.ts
├── test/                        Test files
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Workflow by Role

### End User (CLI)

1. Read [../README.md](../README.md#installation) for installation
2. Follow [../README.md#quick-start](../README.md#quick-start) for setup
3. Use [../README.md#cli-reference](../README.md#cli-reference) as command reference
4. If issues, check [RUNBOOK.md#troubleshooting](./RUNBOOK.md#troubleshooting)

### Library User (JavaScript/TypeScript)

1. Read [../README.md#library-usage](../README.md#library-usage) for API overview
2. Check code examples in [../README.md](../README.md)
3. Refer to [CODEMAPS.md#key-exports](./CODEMAPS.md#key-exports) for all available functions
4. If issues, check [RUNBOOK.md#troubleshooting](./RUNBOOK.md#troubleshooting)

### Contributor

1. Read [CONTRIBUTING.md#development-setup](./CONTRIBUTING.md#development-setup)
2. Review [CONTRIBUTING.md#project-structure](./CONTRIBUTING.md#project-structure)
3. Check [CODEMAPS.md#module-map](./CODEMAPS.md#module-map) to understand module responsibilities
4. Follow [CONTRIBUTING.md#testing-strategy](./CONTRIBUTING.md#testing-strategy) for tests
5. Reference [CONTRIBUTING.md#pull-request-checklist](./CONTRIBUTING.md#pull-request-checklist) before PR

### DevOps/Operations

1. Review [RUNBOOK.md#deployment](./RUNBOOK.md#deployment) for setup
2. Check [RUNBOOK.md#monitoring--health](./RUNBOOK.md#monitoring--health) for health checks
3. Use [RUNBOOK.md#troubleshooting](./RUNBOOK.md#troubleshooting) when debugging
4. Follow [RUNBOOK.md#emergency-procedures](./RUNBOOK.md#emergency-procedures) for critical issues
5. Consult [RUNBOOK.md#environment-configuration](./RUNBOOK.md#environment-configuration) for CI setup

### Architect/Senior Developer

1. Review [CODEMAPS.md#architecture-overview](./CODEMAPS.md#architecture-overview) for high-level design
2. Study [CODEMAPS.md#data-flow](./CODEMAPS.md#data-flow) for understanding request flows
3. Check [CODEMAPS.md#dependencies](./CODEMAPS.md#dependencies) for external integrations
4. Review [CODEMAPS.md#key-design-decisions](./CODEMAPS.md#key-design-decisions) for design rationale

---

## Key Information at a Glance

### Versions

| Component | Version |
|-----------|---------|
| auth-agent | 0.1.0 |
| Node.js (required) | ≥ 20.0.0 |
| TypeScript | 5.4.0 |
| Vitest | 1.6.0 |

### Supported Providers

| Provider | Auth Type | Profile ID | Status |
|----------|-----------|------------|--------|
| Anthropic | Static token | anthropic:subscription | Stable |
| OpenAI Codex | OAuth + refresh | openai-codex:subscription | Stable |

### Commands

| Command | Purpose | Documentation |
|---------|---------|---|
| `auth-agent auth login` | Save credentials | [README.md#auth-login](../README.md#auth-login) |
| `auth-agent auth status` | Show saved credentials | [README.md#auth-status](../README.md#auth-status) |
| `auth-agent auth remove` | Delete credentials | [README.md#auth-remove](../README.md#auth-remove) |
| `auth-agent run` | Run a prompt | [README.md#run](../README.md#run) |

### npm Scripts

| Script | Purpose | Documentation |
|--------|---------|---|
| `npm run dev` | Run CLI from source | [CONTRIBUTING.md#development-setup](./CONTRIBUTING.md#development-setup) |
| `npm run build` | Compile TypeScript | [CONTRIBUTING.md#available-commands](./CONTRIBUTING.md#available-commands) |
| `npm test` | Run test suite | [CONTRIBUTING.md#testing-strategy](./CONTRIBUTING.md#testing-strategy) |
| `npm run test:watch` | Watch mode tests | [CONTRIBUTING.md#available-commands](./CONTRIBUTING.md#available-commands) |

---

## Documentation Maintenance

### Update Schedule

- **Last Updated:** 2026-03-09
- **Review Frequency:** Quarterly or when major features added
- **Auto-Generated Sections:** None (all manually maintained)

### How to Update Docs

When code changes, update corresponding docs:

1. **New feature?** → Update [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODEMAPS.md](./CODEMAPS.md)
2. **Bug fix?** → Update [RUNBOOK.md](./RUNBOOK.md#troubleshooting) if relevant
3. **New command?** → Update [../README.md](../README.md#cli-reference)
4. **New provider?** → Update [CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-new-provider) and all docs
5. **Configuration change?** → Update [../README.md#configuration](../README.md#configuration) and [RUNBOOK.md](./RUNBOOK.md#environment-configuration)

---

## Related Documentation

- **GitHub Issues:** Bug reports and feature requests
- **Package Registry:** https://www.npmjs.com/package/auth-agent
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Vitest Docs:** https://vitest.dev/
- **Commander.js Docs:** https://github.com/tj/commander.js#readme

---

## Summary

auth-agent documentation is organized by audience and use case:

- **[README.md](../README.md)** — For all users
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — For developers
- **[CODEMAPS.md](./CODEMAPS.md)** — For architects & deep technical understanding
- **[RUNBOOK.md](./RUNBOOK.md)** — For operations & production

**Total documentation:** 1,726 lines across 4 comprehensive guides.

**All documentation is up-to-date as of 2026-03-09** and reflects the actual codebase structure and functionality.

---

**Questions?** Open an issue on GitHub or refer to the specific documentation file for your use case.
