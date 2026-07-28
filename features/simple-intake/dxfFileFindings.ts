/**
 * Independent DXF file-level findings — never counted as material rows.
 */

import { classifyDxfDuplicates } from "./classifyDxfDuplicates";
import { normalizeDxfFileKey } from "./normalizeDxfFileKey";
import {
  normalizePartIdForMatch,
  partIdFromDxfFilename,
} from "./normalizePartId";
import { getSourceItemIdentifier } from "./sourceItemIdentifier";
import type { SimpleDxfPart } from "./types";
import type { FinalIntakeRow } from "./results/types";

export type DxfFileFindingType =
  | "UNREFERENCED_DXF"
  | "DUPLICATE_CONTENT"
  | "SAME_IDENTIFIER_DIFFERENT_CONTENT"
  | "INVALID_DXF";

export type DxfFileFinding = {
  id: string;
  type: DxfFileFindingType;
  severity: "INFO" | "REVIEW" | "BLOCKING";
  dxfIds: string[];
  title: string;
  description: string;
};

function dxfMatchesSourceKey(dxf: SimpleDxfPart, key: string): boolean {
  if (key.startsWith("file:")) {
    return normalizeDxfFileKey(dxf.filename) === key.slice(5);
  }
  if (key.startsWith("part:")) {
    const partNorm = key.slice(5);
    const fromPart = normalizePartIdForMatch(dxf.partId);
    if (fromPart && fromPart === partNorm) return true;
    return (
      normalizePartIdForMatch(partIdFromDxfFilename(dxf.filename)) === partNorm
    );
  }
  return false;
}

function materialSourceKeys(
  materialItems: ReadonlyArray<FinalIntakeRow>
): Set<string> {
  const keys = new Set<string>();
  for (const item of materialItems) {
    if (item.isExcluded) continue;
    const id = getSourceItemIdentifier({
      partId: item.part.sourcePartId,
      dxfFileName: null,
    });
    // Prefer display matched filename context from match method message if any;
    // FinalIntakeRow does not carry explicit dxfFileName — use part ID + matched
    // only for assignment. Source filename may appear in match.message for missing.
    if (id) {
      keys.add(
        id.type === "DXF_FILENAME"
          ? `file:${id.normalizedValue}`
          : `part:${id.normalizedValue}`
      );
    }
    if (item.part.sourcePartId) {
      const n = normalizePartIdForMatch(item.part.sourcePartId);
      if (n) keys.add(`part:${n}`);
    }
  }
  return keys;
}

/**
 * File-level DXF findings independent of material-row categories.
 */
export function deriveDxfFileFindings(
  dxfRegistry: ReadonlyArray<SimpleDxfPart>,
  materialItems: ReadonlyArray<FinalIntakeRow>,
  duplicateRegistry?: {
    secondaryDuplicateFileIds: ReadonlySet<string>;
    repeatedUploadExcludedDxfIds?: ReadonlySet<string>;
    groups: ReturnType<typeof classifyDxfDuplicates>["groups"];
  } | null
): DxfFileFinding[] {
  const classified =
    duplicateRegistry != null
      ? {
          groups: duplicateRegistry.groups,
          secondaryDuplicateFileIds: duplicateRegistry.secondaryDuplicateFileIds,
          repeatedUploadExcludedDxfIds:
            duplicateRegistry.repeatedUploadExcludedDxfIds ??
            duplicateRegistry.secondaryDuplicateFileIds,
        }
      : classifyDxfDuplicates(dxfRegistry, {
          sourceRows: materialItems.map((m) => ({
            partId: m.part.sourcePartId,
            dxfFileName: null,
          })),
        });

  const findings: DxfFileFinding[] = [];
  const sourceKeys = materialSourceKeys(materialItems);
  const repeatedUploadExcluded =
    "repeatedUploadExcludedDxfIds" in classified &&
    classified.repeatedUploadExcludedDxfIds
      ? classified.repeatedUploadExcludedDxfIds
      : classified.secondaryDuplicateFileIds;
  const seenConflictIds = new Set<string>();

  const differentNameSameContentIds = new Set<string>();
  const differentNameGroups = classified.groups.filter(
    (g) => g.classification === "DIFFERENT_NAME_SAME_CONTENT"
  );

  for (const group of classified.groups) {
    if (group.classification === "SAME_NAME_SAME_CONTENT") {
      findings.push({
        id: `dup_${group.groupId}`,
        type: "DUPLICATE_CONTENT",
        severity: "INFO",
        dxfIds: group.files.map((f) => f.fileId),
        title: "נמצאו קובצי DXF עם תוכן זהה",
        description: group.files.map((f) => f.originalFileName).join(", "),
      });
    }
    if (group.classification === "DIFFERENT_NAME_SAME_CONTENT") {
      for (const f of group.files) differentNameSameContentIds.add(f.fileId);
      findings.push({
        id: `dup_${group.groupId}`,
        type: "DUPLICATE_CONTENT",
        severity: "INFO",
        dxfIds: group.files.map((f) => f.fileId),
        title: "נמצאו קובצי DXF עם תוכן זהה",
        description: "הקבצים מופיעים בשמות שונים אך מכילים תוכן זהה.",
      });
    }
    if (group.classification === "SAME_NAME_DIFFERENT_CONTENT") {
      const dxfIds = group.files.map((f) => f.fileId);
      findings.push({
        id: `conflict_${group.groupId}`,
        type: "SAME_IDENTIFIER_DIFFERENT_CONTENT",
        severity: "BLOCKING",
        dxfIds,
        title: "נמצאו כמה קובצי DXF שונים עם אותו מזהה",
        description: group.files.map((f) => f.originalFileName).join(", "),
      });
      for (const id of dxfIds) seenConflictIds.add(id);
    }
  }

  // Same part-stem identifier across filenames with different content
  const byPartStem = new Map<string, SimpleDxfPart[]>();
  for (const dxf of dxfRegistry) {
    const stem = normalizePartIdForMatch(partIdFromDxfFilename(dxf.filename));
    if (!stem) continue;
    const list = byPartStem.get(stem) ?? [];
    list.push(dxf);
    byPartStem.set(stem, list);
  }
  for (const [stem, parts] of byPartStem) {
    if (parts.length < 2) continue;
    if (parts.every((p) => seenConflictIds.has(p.id))) continue;
    const hashes = new Set(
      parts.map((p) => p.contentHash ?? p.fingerprint ?? `id:${p.id}`)
    );
    if (hashes.size < 2) continue;
    findings.push({
      id: `id_conflict_${stem}`,
      type: "SAME_IDENTIFIER_DIFFERENT_CONTENT",
      severity: "BLOCKING",
      dxfIds: parts.map((p) => p.id),
      title: "נמצאו כמה קובצי DXF שונים עם אותו מזהה",
      description: parts.map((p) => p.filename).join(", "),
    });
  }

  for (const dxf of dxfRegistry) {
    if (dxf.geometryStatus === "VALID") continue;
    findings.push({
      id: `invalid_${dxf.id}`,
      type: "INVALID_DXF",
      severity: "REVIEW",
      dxfIds: [dxf.id],
      title: "קובץ DXF אינו תקין",
      description: dxf.filename,
    });
  }

  for (const dxf of dxfRegistry) {
    if (dxf.geometryStatus !== "VALID") continue;
    if (repeatedUploadExcluded.has(dxf.id)) continue;
    const referencedBySource = [...sourceKeys].some((k) =>
      dxfMatchesSourceKey(dxf, k)
    );
    if (referencedBySource) continue;
    // Content-identical siblings of a referenced DXF stay informational only.
    if (differentNameSameContentIds.has(dxf.id)) {
      const coveredBySibling = differentNameGroups.some(
        (g) =>
          g.files.some((f) => f.fileId === dxf.id) &&
          g.files.some((f) => {
            if (f.fileId === dxf.id) return false;
            const sibling = dxfRegistry.find((d) => d.id === f.fileId);
            if (!sibling) return false;
            return [...sourceKeys].some((k) =>
              dxfMatchesSourceKey(sibling, k)
            );
          })
      );
      if (coveredBySibling) continue;
    }
    findings.push({
      id: `unref_${dxf.id}`,
      type: "UNREFERENCED_DXF",
      severity: "INFO",
      dxfIds: [dxf.id],
      title: "הקובץ הועלה אך אינו מופיע ברשימת החומר",
      description: dxf.filename,
    });
  }

  return findings;
}
