/**
 * Defensive limits + path validation for untrusted .omega archives.
 * Applied both when building (defense-in-depth) and when reading archives.
 */

export const OMEGA_ARCHIVE_MAX_ENTRIES = 5000;
export const OMEGA_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
export const OMEGA_ARCHIVE_MAX_ENTRY_BYTES = 100 * 1024 * 1024;

const ARCHIVE_ERROR_PREFIX = "לא ניתן לפתוח את קובץ ההצעה";

/**
 * Normalize + validate a path intended for storage inside (or extraction
 * from) a .omega archive. Rejects absolute paths, parent-traversal, and
 * backslash-based traversal tricks. Returns the normalized forward-slash path.
 */
export function assertSafeArchivePath(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`${ARCHIVE_ERROR_PREFIX} — נתיב קובץ ריק בארכיון.`);
  }

  // Normalize backslashes to forward slashes before inspecting segments —
  // a raw archive could smuggle "..\\..\\etc" past a naive "../" check.
  const normalized = path.replace(/\\/g, "/");

  if (normalized.includes("\0")) {
    throw new Error(`${ARCHIVE_ERROR_PREFIX} — תו לא חוקי בנתיב קובץ.`);
  }
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`${ARCHIVE_ERROR_PREFIX} — נתיב קובץ מוחלט אינו מורשה.`);
  }

  const segments = normalized.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      throw new Error(
        `${ARCHIVE_ERROR_PREFIX} — נתיב קובץ מכיל ניווט תיקיות אסור (..).`
      );
    }
  }

  const cleaned = segments.filter((s) => s.length > 0 && s !== ".").join("/");
  if (!cleaned) {
    throw new Error(`${ARCHIVE_ERROR_PREFIX} — נתיב קובץ ריק בארכיון.`);
  }
  return cleaned;
}

/**
 * Guard against zip-bomb style archives while iterating entries.
 * Call incrementally as entries/bytes are discovered.
 */
export function assertArchiveBudgets(
  entryCount: number,
  uncompressedTotalBytes: number
): void {
  if (entryCount > OMEGA_ARCHIVE_MAX_ENTRIES) {
    throw new Error(
      `${ARCHIVE_ERROR_PREFIX} — הארכיון מכיל יותר מדי קבצים (מעל ${OMEGA_ARCHIVE_MAX_ENTRIES}).`
    );
  }
  if (uncompressedTotalBytes > OMEGA_ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
    throw new Error(
      `${ARCHIVE_ERROR_PREFIX} — הארכיון חורג בגודלו הכולל המורשה.`
    );
  }
}

export function assertSafeEntryByteLength(byteLength: number): void {
  if (byteLength > OMEGA_ARCHIVE_MAX_ENTRY_BYTES) {
    throw new Error(
      `${ARCHIVE_ERROR_PREFIX} — קובץ בודד בארכיון חורג בגודלו המורשה.`
    );
  }
}
