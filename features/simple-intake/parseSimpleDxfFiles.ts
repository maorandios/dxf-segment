/**
 * Local DXF parsing for Simple Intake — uses low-level parseDxfFile only.
 */

import { parseDxfFile } from "@/lib/parsers/dxfParser";
import { fingerprintFile, partIdFromDxfFilename } from "./normalizePartId";
import type { SimpleDxfPart } from "./types";

function newId(): string {
  return `dxf_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("READ_FAILED"));
    reader.readAsText(file);
  });
}

export async function parseSimpleDxfFiles(
  files: File[]
): Promise<{ parts: SimpleDxfPart[]; warnings: string[] }> {
  const parts: SimpleDxfPart[] = [];
  const warnings: string[] = [];
  const seenFingerprints = new Map<string, string>();
  const seenPartIds = new Map<string, string>();

  for (const file of files) {
    const id = newId();
    const partId = partIdFromDxfFilename(file.name);
    let fingerprint: string | null = null;
    try {
      fingerprint = await fingerprintFile(file);
      const prevFp = seenFingerprints.get(fingerprint);
      if (prevFp) {
        warnings.push(`DUPLICATE_FILE:${file.name}~${prevFp}`);
      } else {
        seenFingerprints.set(fingerprint, file.name);
      }
    } catch {
      fingerprint = null;
    }

    const normId = partId.trim().toUpperCase();
    if (normId) {
      const prev = seenPartIds.get(normId);
      if (prev) warnings.push(`DUPLICATE_PART_ID:${file.name}~${prev}`);
      else seenPartIds.set(normId, file.name);
    }

    try {
      const content = await readFileText(file);
      const parsed = parseDxfFile(content, id, file.name, "simple", "simple");
      const processed = parsed.geometry.processedGeometry;
      const bb = processed?.boundingBox;
      const widthMm =
        bb && Number.isFinite(bb.width) && bb.width > 0 ? bb.width : null;
      const lengthMm =
        bb && Number.isFinite(bb.height) && bb.height > 0 ? bb.height : null;
      const areaMm2 =
        widthMm != null && lengthMm != null ? widthMm * lengthMm : null;
      const valid =
        processed != null &&
        (processed.status === "valid" || processed.status === "warning") &&
        widthMm != null &&
        lengthMm != null;

      parts.push({
        id,
        filename: file.name,
        partId,
        widthMm,
        lengthMm,
        areaMm2,
        geometryStatus: valid ? "VALID" : "INVALID",
        error: valid
          ? null
          : parsed.warnings.join("; ") || "INVALID_GEOMETRY",
        fingerprint,
      });
      if (parsed.warnings.length > 0 && !valid) {
        warnings.push(`DXF_WARN:${file.name}:${parsed.warnings[0]}`);
      }
    } catch (err) {
      parts.push({
        id,
        filename: file.name,
        partId,
        widthMm: null,
        lengthMm: null,
        areaMm2: null,
        geometryStatus: "INVALID",
        error: err instanceof Error ? err.message : String(err),
        fingerprint,
      });
      warnings.push(`DXF_READ_FAILED:${file.name}`);
    }
  }

  return { parts, warnings };
}
