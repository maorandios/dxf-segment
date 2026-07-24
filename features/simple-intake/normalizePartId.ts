/**
 * Minimal part-ID / filename normalization for Simple Intake matching.
 */

import { calculateFileSha256 } from "./calculateFileSha256";

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

/** SHA-256 of file bytes — used as contentHash for exact duplicate detection. */
export async function fingerprintFile(file: File): Promise<string> {
  return calculateFileSha256(file);
}
