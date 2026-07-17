/**
 * Content fingerprint for duplicate detection (SHA-256 of file bytes).
 * No second incompatible algorithm — crypto.subtle when available.
 */

export async function fingerprintFile(file: File): Promise<string | null> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const bytes = new Uint8Array(digest);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    /* fall through */
  }
  // Deterministic fallback without inventing a second hash family:
  // size + lastModified + name is weaker; prefer null so same-name
  // different-bytes are not collapsed incorrectly.
  return null;
}
