/**
 * Normalize DXF filenames for exact local matching keys.
 * Preserves original extracted values separately; this is matching-only.
 */

export function normalizeDxfFileKey(value: string): string {
  let s = value.trim();
  if (!s) return "";

  // Unicode normalize
  try {
    s = s.normalize("NFKC");
  } catch {
    // ignore environments without normalize
  }

  // Remove directory paths (Windows / POSIX)
  s = s.replace(/^.*[/\\]/, "");

  // Strip .dxf extension case-insensitively
  s = s.replace(/\.dxf$/i, "");

  s = s.toLowerCase();

  // Harmless spaces, underscores, repeated separators → single hyphen
  s = s
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return s;
}

export function hasExplicitDxfFileName(
  value: string | null | undefined
): boolean {
  if (value == null) return false;
  return normalizeDxfFileKey(value) !== "";
}
