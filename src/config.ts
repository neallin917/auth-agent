/**
 * Centralized path configuration — zero hardcoded paths.
 *
 * Resolution order:
 *   1. AUTH_AGENT_STORE_DIR env var (explicit override, useful in CI)
 *   2. $XDG_CONFIG_HOME/auth-agent (XDG Base Directory standard)
 *   3. ~/.auth-agent (default)
 *
 * Any user on any machine can run the tool without modifying code.
 */
import os from "node:os";
import path from "node:path";

export function getStoreDir(): string {
  if (process.env.AUTH_AGENT_STORE_DIR) {
    return process.env.AUTH_AGENT_STORE_DIR;
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return path.join(xdg, "auth-agent");
  }
  return path.join(os.homedir(), ".auth-agent");
}

export function getStorePath(): string {
  return path.join(getStoreDir(), "auth-profiles.json");
}
