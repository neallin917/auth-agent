/**
 * Auth profile store — read/write ~/.auth-agent/auth-profiles.json
 * (or custom path via AUTH_AGENT_STORE_DIR env var).
 *
 * All operations follow immutable patterns: functions return new objects
 * rather than mutating existing ones.
 */
import fs from "node:fs";
import path from "node:path";
import { getStoreDir, getStorePath } from "../config.js";
import type { AuthProfileCredential, AuthProfileStore } from "./types.js";

const STORE_VERSION = 1 as const;

function emptyStore(): AuthProfileStore {
  return { version: STORE_VERSION, profiles: {} };
}

/**
 * Runtime type guard for a single AuthProfileCredential.
 * Validates the minimum required fields for each credential type so that
 * corrupted or schema-mismatched entries are caught at load time rather than
 * at the point of use (where errors would be hard to diagnose).
 */
function isValidCredential(c: unknown): c is AuthProfileCredential {
  if (typeof c !== "object" || c === null) return false;
  const obj = c as Record<string, unknown>;
  if (obj.type === "token") {
    return typeof obj.provider === "string" && typeof obj.token === "string";
  }
  if (obj.type === "oauth") {
    return (
      typeof obj.provider === "string" &&
      typeof obj.access === "string" &&
      typeof obj.refresh === "string" &&
      typeof obj.expires === "number"
    );
  }
  return false;
}

/**
 * Load the auth store from disk.
 * Returns an empty store if the file does not exist yet.
 */
export function loadStore(): AuthProfileStore {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    return emptyStore();
  }
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw) as { version: unknown; profiles?: Record<string, unknown> };
    if (parsed.version !== STORE_VERSION) {
      process.stderr.write(
        `[auth-agent] warn: store version mismatch (expected ${STORE_VERSION}, got ${String(parsed.version)}); resetting.\n`,
      );
      return emptyStore();
    }
    // Validate each profile entry at runtime; skip — rather than crash on — invalid ones.
    const validProfiles: Record<string, AuthProfileCredential> = {};
    for (const [id, cred] of Object.entries(parsed.profiles ?? {})) {
      if (isValidCredential(cred)) {
        validProfiles[id] = cred;
      } else {
        process.stderr.write(`[auth-agent] warn: skipping invalid profile "${id}".\n`);
      }
    }
    return { version: STORE_VERSION, profiles: validProfiles };
  } catch {
    process.stderr.write("[auth-agent] warn: could not parse auth store; starting fresh.\n");
    return emptyStore();
  }
}

/**
 * Persist the auth store to disk.
 * Creates the directory with mode 700 if it does not exist.
 * Sets file permissions to 600 (owner read/write only).
 */
export function saveStore(store: AuthProfileStore): void {
  const storeDir = getStoreDir();
  const storePath = getStorePath();

  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  }

  const json = JSON.stringify(store, null, 2);
  fs.writeFileSync(storePath, json, { encoding: "utf-8", mode: 0o600 });
}

/**
 * Insert or update a profile in the store.
 * Returns a new store object (immutable).
 */
export function upsertProfile(
  store: AuthProfileStore,
  profileId: string,
  credential: AuthProfileCredential,
): AuthProfileStore {
  return {
    ...store,
    profiles: {
      ...store.profiles,
      [profileId]: credential,
    },
  };
}

/**
 * Remove a profile from the store.
 * Returns a new store object (immutable).
 */
export function removeProfile(store: AuthProfileStore, profileId: string): AuthProfileStore {
  const { [profileId]: _removed, ...rest } = store.profiles;
  return { ...store, profiles: rest };
}

/**
 * Convenience: upsert a profile and immediately save to disk.
 */
export function upsertAndSave(profileId: string, credential: AuthProfileCredential): void {
  const current = loadStore();
  const updated = upsertProfile(current, profileId, credential);
  saveStore(updated);
}

/**
 * Get a profile by ID, or undefined if not found.
 */
export function getProfile(
  store: AuthProfileStore,
  profileId: string,
): AuthProfileCredential | undefined {
  return store.profiles[profileId];
}

/**
 * Resolve the absolute path of the store file (for display purposes).
 */
export function resolveStorePath(): string {
  return path.resolve(getStorePath());
}
