/**
 * Minimal part-ID / filename normalization for Simple Intake matching.
 */

export function normalizePartIdForMatch(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[_./\\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function partIdFromDxfFilename(filename: string): string {
  return filename.replace(/\.dxf$/i, "").trim();
}

export async function fingerprintFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // FNV-1a 32-bit — enough for duplicate detection in-session
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16)}:${file.size}`;
}
