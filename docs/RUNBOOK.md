# auth-agent Runbook

**Last Updated:** 2026-03-09

Operational guide for running, deploying, and troubleshooting auth-agent in production and CI environments.

---

## Table of Contents

- [Deployment](#deployment)
- [Monitoring & Health](#monitoring--health)
- [Troubleshooting](#troubleshooting)
- [Credential Store Management](#credential-store-management)
- [Environment Configuration](#environment-configuration)
- [Emergency Procedures](#emergency-procedures)
- [Recovery Procedures](#recovery-procedures)

---

## Deployment

### Pre-deployment Checklist

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] No hardcoded secrets in code
- [ ] No debug statements left in code
- [ ] Changelog updated (if applicable)
- [ ] Version bumped in `package.json` (semver)
- [ ] Git tag created: `git tag v0.2.0`

### Installation Paths

#### As a Global CLI Tool

**For end users:**

```bash
npm install -g auth-agent@latest
auth-agent auth status
```

**For development/testing:**

```bash
npm install -g /path/to/local/auth-agent
auth-agent auth status
```

#### As a Project Dependency

**In another project:**

```bash
npm install auth-agent
```

Then use in code:

```typescript
import { resolveToken, callAnthropic } from "auth-agent";
const { token } = await resolveToken("anthropic");
```

### NPM Registry Publication

```bash
# Ensure you're logged in to npm
npm login

# Verify version is new (check npm registry)
npm view auth-agent version

# Run prepublish checks (builds + tests)
npm run prepublishOnly

# Publish to npm
npm publish

# Verify publication
npm info auth-agent
# Should show your new version in "dist-tags"
```

### CI/CD Integration

#### GitHub Actions Example

```yaml
name: Build and Publish

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### GitLab CI Example

```yaml
publish:
  stage: deploy
  image: node:20
  script:
    - npm ci
    - npm test
    - npm run build
    - npm publish
  only:
    - tags
  variables:
    NPM_TOKEN: $CI_JOB_TOKEN
```

---

## Monitoring & Health

### Health Check Commands

```bash
# Check credentials are accessible
auth-agent auth status

# Expected output shows:
# - Store location
# - Each provider's login status
# - Token expiry for OAuth providers
```

### Credential Store Integrity

Check store file permissions (should be `600`):

```bash
# Unix/macOS
ls -la ~/.auth-agent/auth-profiles.json
# Expected: -rw------- (owner read/write only)

# Create store with correct permissions
AUTH_AGENT_STORE_DIR=/tmp/secure auth-agent auth login --provider anthropic
```

### Token Expiry Monitoring

OAuth tokens (OpenAI Codex) auto-refresh on use, but you can check expiry:

```bash
auth-agent auth status
# Shows "expires: 3/10/2026, 7:15:00 AM"
```

If tokens are expiring frequently:
1. Ensure system clock is accurate (`date` command)
2. Check network connectivity
3. Re-login: `auth-agent auth login --provider openai-codex`

---

## Troubleshooting

### Issue: "No credentials found for anthropic"

**Symptom:**
```
Error: No credentials found for anthropic. Run: auth-agent auth login --provider anthropic
```

**Cause:** User hasn't logged in yet or credentials were deleted.

**Solution:**

```bash
# Step 1: Generate setup token from claude CLI
claude setup-token
# Copy the sk-ant-oat-... token

# Step 2: Save to auth-agent
auth-agent auth login --provider anthropic
# Paste token when prompted

# Step 3: Verify
auth-agent auth status
```

### Issue: "OAuth token expired" or "PKCE flow failed"

**Symptom:**
```
Error: Token expired or invalid. Run: auth-agent auth login --provider openai-codex
```

**Cause:** OAuth token is invalid or refresh failed.

**Solution:**

```bash
# Re-authenticate
auth-agent auth login --provider openai-codex
# Browser window should open for re-auth

# If browser doesn't open (headless server):
auth-agent auth login --provider openai-codex
# Prints a URL — paste in browser, then paste redirect back
```

### Issue: Store file is corrupted

**Symptom:**
```
Error: Failed to parse /home/user/.auth-agent/auth-profiles.json
```

**Cause:** Store file is malformed JSON or corrupted.

**Solution:**

```bash
# Backup the corrupted file
cp ~/.auth-agent/auth-profiles.json ~/.auth-agent/auth-profiles.json.bak

# Remove it — auth-agent will create a fresh one on next login
rm ~/.auth-agent/auth-profiles.json

# Re-login to all providers
auth-agent auth login --provider anthropic
auth-agent auth login --provider openai-codex

# Verify
auth-agent auth status
```

### Issue: "Permission denied" accessing store

**Symptom:**
```
Error: EACCES: permission denied, open '/home/user/.auth-agent/auth-profiles.json'
```

**Cause:** Store file has incorrect permissions (should be `600`).

**Solution:**

```bash
# Fix permissions
chmod 600 ~/.auth-agent/auth-profiles.json

# Verify
ls -la ~/.auth-agent/auth-profiles.json
# Should show: -rw------- (owner read/write only)

# Check directory too
chmod 700 ~/.auth-agent
ls -la ~/.auth-agent/
# Should show: drwx------ (owner read/write/execute only)
```

### Issue: CLI works but library import fails

**Symptom:**
```
TypeError: Cannot find module 'auth-agent'
```

**Cause:** Package not installed in the project.

**Solution:**

```bash
# Install as dependency
npm install auth-agent

# Or if developing locally
npm install /path/to/auth-agent

# Verify installation
npm list auth-agent
```

### Issue: "Model not found" error

**Symptom:**
```
Error: Model 'gpt-4' not supported by Codex endpoint
```

**Cause:** OpenAI Codex endpoint only accepts Codex models (gpt-5.x-codex-*).

**Solution:**

```bash
# Use correct model for Codex
auth-agent run "Hello" --provider openai-codex --model gpt-5-codex-1
# Not: gpt-4, gpt-4o, etc.

# For regular GPT-4o, use Anthropic's Claude or create a separate integration
```

### Issue: Network timeout or connection refused

**Symptom:**
```
Error: ECONNREFUSED / ETIMEDOUT connecting to API
```

**Cause:** Network connectivity issue, firewall, or API service down.

**Solution:**

```bash
# Check network
curl -I https://api.anthropic.com  # For Anthropic
curl -I https://chatgpt.com        # For OpenAI

# Check DNS
dig api.anthropic.com

# Test with a simple request
npm run dev -- run "Hello" --provider anthropic

# If still failing, check:
# - Proxy settings: check http_proxy, https_proxy env vars
# - Firewall: may need to allow outbound HTTPS
# - VPN: try disabling if connected
```

---

## Credential Store Management

### Store Location Resolution

The store file is resolved in this order (first match wins):

```
1. AUTH_AGENT_STORE_DIR environment variable (if set)
   └─ $AUTH_AGENT_STORE_DIR/auth-profiles.json

2. XDG_CONFIG_HOME environment variable (if set)
   └─ $XDG_CONFIG_HOME/auth-agent/auth-profiles.json

3. Default home directory
   └─ ~/.auth-agent/auth-profiles.json
```

### Using Custom Store Location

```bash
# CI environment
export AUTH_AGENT_STORE_DIR=/tmp/ci-auth-store
auth-agent auth login --provider anthropic
auth-agent auth status

# Docker
docker run -e AUTH_AGENT_STORE_DIR=/secrets/auth-agent my-image
```

### Backup and Restore

```bash
# Backup store
cp ~/.auth-agent/auth-profiles.json ~/.auth-agent/auth-profiles.json.$(date +%s).bak

# List backups
ls -lt ~/.auth-agent/auth-profiles.json.*.bak

# Restore from backup
cp ~/.auth-agent/auth-profiles.json.1234567890.bak ~/.auth-agent/auth-profiles.json
auth-agent auth status
```

### Inspecting Store Contents

```bash
# View store structure (don't expose tokens in shared output!)
cat ~/.auth-agent/auth-profiles.json | jq '.profiles | keys'
# Output: ["anthropic:subscription", "openai-codex:subscription"]

# Check credential type
cat ~/.auth-agent/auth-profiles.json | jq '.profiles."anthropic:subscription".type'
# Output: "token"

# Never output the actual token!
cat ~/.auth-agent/auth-profiles.json | jq '.profiles."anthropic:subscription".token'
# ← DO NOT DO THIS in shared environments
```

### Removing Credentials

```bash
# Remove specific provider
auth-agent auth remove --provider anthropic
auth-agent auth remove --provider openai-codex

# Verify removal
auth-agent auth status
```

### Multi-user Setup

In shared environments, isolate stores per user:

```bash
# User 1
export AUTH_AGENT_STORE_DIR=/home/user1/.auth-agent
auth-agent auth login --provider anthropic

# User 2
export AUTH_AGENT_STORE_DIR=/home/user2/.auth-agent
auth-agent auth login --provider anthropic
```

---

## Environment Configuration

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `AUTH_AGENT_STORE_DIR` | Override credential store location | `/tmp/my-store` |
| `XDG_CONFIG_HOME` | XDG Base Directory standard | `~/.config` |
| `NODE_ENV` | Optional: affects logging/debugging | `production`, `development` |

### TypeScript/Node Configuration

```bash
# Check Node version (must be ≥ 20.0.0)
node --version

# Check npm version (must be ≥ 10)
npm --version

# Check installed auth-agent version
npm list -g auth-agent
# or in project: npm list auth-agent
```

### CI Environment Setup

```yaml
# GitHub Actions
- uses: actions/setup-node@v3
  with:
    node-version: '20'

# GitLab CI
image: node:20-alpine

# CircleCI
jobs:
  build:
    docker:
      - image: cimg/node:20.0
```

---

## Emergency Procedures

### Immediate Credential Revocation

If you suspect credentials are compromised:

```bash
# Immediately remove from auth-agent
auth-agent auth remove --provider anthropic
auth-agent auth remove --provider openai-codex

# Generate new tokens:
# Anthropic: `claude setup-token` (generates new sk-ant-oat-... token)
# OpenAI: Go to https://chatgpt.com, re-authenticate

# Re-login to auth-agent
auth-agent auth login --provider anthropic
auth-agent auth login --provider openai-codex
```

### Service Degradation (API Down)

If Anthropic or OpenAI APIs are unavailable:

```bash
# Check status
curl -s -o /dev/null -w "%{http_code}" https://api.anthropic.com
# 200 = OK, 5xx = Service issue

# Try the other provider if available
npm run dev -- run "Test" --provider openai-codex

# If both are down, wait for recovery. Check:
# - https://status.anthropic.com (if exists)
# - https://status.openai.com
```

### Full Store Recovery

If the entire store directory is lost or corrupted:

```bash
# Identify the backup location
ls -la ~/.auth-agent/auth-profiles.json.*.bak

# Restore most recent backup
LATEST=$(ls -t ~/.auth-agent/auth-profiles.json.*.bak | head -1)
cp "$LATEST" ~/.auth-agent/auth-profiles.json

# Verify
auth-agent auth status

# If no backup available, re-authenticate from scratch:
rm -rf ~/.auth-agent
auth-agent auth login --provider anthropic
auth-agent auth login --provider openai-codex
```

---

## Recovery Procedures

### After System Crash

auth-agent is stateless except for the credential store. After a crash:

```bash
# 1. Verify store file integrity
cat ~/.auth-agent/auth-profiles.json | jq . > /dev/null
# If valid JSON, output shows no error

# 2. Check credentials are still valid
auth-agent auth status

# 3. If store is corrupted, restore from backup (see Emergency Procedures)
```

### After NPM Package Upgrade

```bash
# Update globally
npm install -g auth-agent@latest

# Verify version
auth-agent --version

# Test CLI still works
auth-agent auth status
auth-agent run "Test" --provider anthropic

# No migration needed — store format is backward compatible
```

### OAuth Token Refresh Failure

If OAuth token refresh fails during a call:

```bash
# The error message will indicate the issue
# Common reasons:
# - Network connectivity
# - Refresh token expired (rare, ask user to re-authenticate)
# - System clock skew (check: date)

# Resolution:
auth-agent auth login --provider openai-codex
# This will prompt for re-authentication
```

### Rollback to Previous Version

If an upgrade causes issues:

```bash
# Rollback globally
npm install -g auth-agent@0.1.0

# Rollback in a project
npm install auth-agent@0.1.0

# Store is backward compatible — no data migration needed
auth-agent auth status
```

---

## Support & Escalation

### Gathering Diagnostic Information

When reporting issues, collect:

```bash
# System info
node --version
npm --version

# auth-agent info
auth-agent --version
ls -la ~/.auth-agent/

# Check store (don't share credentials!)
cat ~/.auth-agent/auth-profiles.json | jq '.profiles | keys'

# Check for errors
npm run build 2>&1
npm test 2>&1
```

### Known Limitations

1. **OpenAI Codex endpoint**: Only accepts Codex models (`gpt-5.x-codex-*`), not `gpt-4o` or regular chat models
2. **Token expiry**: Static tokens (Anthropic) don't auto-refresh if they expire
3. **Store location**: Moves if `XDG_CONFIG_HOME` or `AUTH_AGENT_STORE_DIR` change (old store is not migrated)
4. **Multi-machine**: Store is per-machine — credentials aren't synced across devices

---

## Maintenance

### Regular Tasks

- [ ] Weekly: Check `auth-agent auth status` for token expiry warnings
- [ ] Monthly: Review npm security advisories: `npm audit`
- [ ] Quarterly: Update dependencies: `npm update`
- [ ] Annually: Review and update documentation

### Automated Cleanup

auth-agent does not leave temporary files or cache. All state is in the credential store at `~/.auth-agent/auth-profiles.json`.

---

**Last Updated:** 2026-03-09

For issues or questions, refer to the main [README.md](../README.md) or [CONTRIBUTING.md](./CONTRIBUTING.md).
