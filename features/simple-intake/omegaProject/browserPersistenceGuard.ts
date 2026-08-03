/**
 * NON-NEGOTIABLE INVARIANT: the OMEGA portable project module never writes
 * quotation data to localStorage, sessionStorage, indexedDB, OPFS, or
 * CacheStorage. The only persistence primitives it uses are process memory
 * and the explicit, user-initiated .omega file download/selection.
 *
 * This module holds counters that must stay at zero in production. The
 * `recordBrowserProjectPersistenceAttempt` function exists purely so tests
 * can assert the guard fires — no production code path in this feature
 * should ever call it.
 */

import type {
  BrowserPersistenceKind,
  BrowserProjectPersistenceDiagnostics,
} from "./types";

export const OMEGA_PROJECT_NEVER_PERSISTS_TO_BROWSER_STORAGE = true as const;

const diagnostics: BrowserProjectPersistenceDiagnostics = {
  localStorageWriteAttempts: 0,
  sessionStorageWriteAttempts: 0,
  indexedDbWriteAttempts: 0,
  opfsWriteAttempts: 0,
  cacheStorageWriteAttempts: 0,
  lastAttemptKind: null,
  lastAttemptAt: null,
};

export function getBrowserProjectPersistenceDiagnostics(): BrowserProjectPersistenceDiagnostics {
  return { ...diagnostics };
}

/**
 * Throws in development whenever any browser-storage write attempt has been
 * recorded. Safe to call defensively before/after save or load operations.
 */
export function assertNoBrowserProjectPersistence(): void {
  const isDev =
    typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV !== "production";
  const total =
    diagnostics.localStorageWriteAttempts +
    diagnostics.sessionStorageWriteAttempts +
    diagnostics.indexedDbWriteAttempts +
    diagnostics.opfsWriteAttempts +
    diagnostics.cacheStorageWriteAttempts;
  if (total > 0 && isDev) {
    throw new Error(
      `[omegaProject] browser-storage persistence attempted (${diagnostics.lastAttemptKind ?? "unknown"}) — ` +
        "quotation data must only live in memory or in a downloaded .omega file."
    );
  }
}

/**
 * Test-only hook: records that some code attempted to persist quotation
 * data to a browser storage mechanism. Production save/load code paths in
 * this feature must never call this for a real write.
 */
export function recordBrowserProjectPersistenceAttempt(
  kind: BrowserPersistenceKind
): void {
  if (kind === "localStorage") diagnostics.localStorageWriteAttempts += 1;
  else if (kind === "sessionStorage")
    diagnostics.sessionStorageWriteAttempts += 1;
  else if (kind === "indexedDb") diagnostics.indexedDbWriteAttempts += 1;
  else if (kind === "opfs") diagnostics.opfsWriteAttempts += 1;
  else if (kind === "cacheStorage") diagnostics.cacheStorageWriteAttempts += 1;
  diagnostics.lastAttemptKind = kind;
  diagnostics.lastAttemptAt = new Date().toISOString();
}

/** Test-only: resets all counters back to zero. */
export function resetBrowserProjectPersistenceDiagnosticsForTests(): void {
  diagnostics.localStorageWriteAttempts = 0;
  diagnostics.sessionStorageWriteAttempts = 0;
  diagnostics.indexedDbWriteAttempts = 0;
  diagnostics.opfsWriteAttempts = 0;
  diagnostics.cacheStorageWriteAttempts = 0;
  diagnostics.lastAttemptKind = null;
  diagnostics.lastAttemptAt = null;
}
