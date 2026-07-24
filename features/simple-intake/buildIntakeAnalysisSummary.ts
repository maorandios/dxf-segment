/**
 * Intake analysis summary — single source of truth for the initial analysis screen.
 * Comparison uses normalized part identifiers (not DXF filename column presence).
 */

import { effectiveMaterialFields } from "./materialList/completeness";
import type { MaterialListRow } from "./materialList/types";
import { normalizePartIdForMatch } from "./normalizePartId";
import type { SimpleDxfPart, SimpleResultRow } from "./types";
import type { FinalIssueCode, FinalIntakeRow } from "./results/types";

export type IntakeDuplicateGroup = {
  normalizedPartId: string;
  files: Array<{ fileName: string; fileId: string }>;
  reason: "PART_ID" | "CONTENT_HASH";
};

export type IntakeAnalysisSummary = {
  material: {
    totalRows: number;
    extractedIdentifierCount: number;
    uniquePartIds: string[];
    rowsWithoutIdentifierCount: number;
  };
  dxf: {
    totalFiles: number;
    uniquePartIds: string[];
    uniqueContentFileCount: number;
    exactContentDuplicateFileCount: number;
    duplicateGroups: IntakeDuplicateGroup[];
  };
  comparison: {
    matchedPartIds: string[];
    missingDxfPartIds: string[];
    extraDxfPartIds: string[];
    conflictingPartIds: string[];
  };
  /** Sum of actionable discrepancy group sizes for the attention card. */
  actionableDiscrepancyCount: number;
  showMissingIdentifiersWarning: boolean;
  ready: boolean;
};

const CONFLICT_CODES: ReadonlySet<FinalIssueCode> = new Set([
  "PART_ID_DIMENSION_MISMATCH",
]);

function contentHashOf(
  part: Pick<SimpleDxfPart, "contentHash" | "fingerprint">
): string | null {
  const h = part.contentHash ?? part.fingerprint;
  return h && h.trim() ? h.trim() : null;
}

export function buildIntakeAnalysisSummary(args: {
  materialRows: ReadonlyArray<MaterialListRow>;
  dxfParts: ReadonlyArray<
    Pick<
      SimpleDxfPart,
      | "id"
      | "filename"
      | "partId"
      | "contentHash"
      | "fingerprint"
      | "geometryStatus"
    >
  >;
  resultRows?: ReadonlyArray<SimpleResultRow>;
  finalRows?: ReadonlyArray<
    Pick<FinalIntakeRow, "issueCodes" | "part" | "isExcluded">
  >;
  ready?: boolean;
}): IntakeAnalysisSummary {
  const ready = args.ready ?? args.materialRows.length > 0;
  const totalRows = args.materialRows.length;

  const extractedMaterialPartIds: string[] = [];
  let rowsWithIdentifier = 0;
  for (const row of args.materialRows) {
    const raw = effectiveMaterialFields(row).partId;
    const norm = normalizePartIdForMatch(raw);
    if (norm) {
      rowsWithIdentifier++;
      extractedMaterialPartIds.push(norm);
    }
  }
  const materialPartIdSet = new Set(extractedMaterialPartIds);
  const uniqueMaterialPartIds = [...materialPartIdSet];

  const dxfPartIdList: string[] = [];
  const byPartId = new Map<string, Array<{ fileName: string; fileId: string }>>();
  const byHash = new Map<string, Array<{ fileName: string; fileId: string; partNorm: string }>>();

  for (const part of args.dxfParts) {
    const norm = normalizePartIdForMatch(part.partId);
    if (norm) {
      dxfPartIdList.push(norm);
      const list = byPartId.get(norm) ?? [];
      list.push({ fileName: part.filename, fileId: part.id });
      byPartId.set(norm, list);
    }
    const hash = contentHashOf(part);
    if (hash) {
      const list = byHash.get(hash) ?? [];
      list.push({
        fileName: part.filename,
        fileId: part.id,
        partNorm: norm || normalizePartIdForMatch(part.filename),
      });
      byHash.set(hash, list);
    }
  }

  const uniqueDxfPartIds = [...new Set(dxfPartIdList)];
  const dxfPartIdSet = new Set(uniqueDxfPartIds);

  const contentHashes = args.dxfParts
    .map(contentHashOf)
    .filter((h): h is string => h != null);
  const unhashedCount = args.dxfParts.length - contentHashes.length;
  const uniqueContentFileCount =
    new Set(contentHashes).size + unhashedCount;
  const exactContentDuplicateFileCount = Math.max(
    0,
    args.dxfParts.length - uniqueContentFileCount
  );

  const duplicateGroups: IntakeDuplicateGroup[] = [];
  const seenFileIds = new Set<string>();

  for (const [normalizedPartId, files] of byPartId) {
    if (files.length <= 1) continue;
    duplicateGroups.push({
      normalizedPartId,
      files: [...files],
      reason: "PART_ID",
    });
    for (const f of files) seenFileIds.add(f.fileId);
  }

  for (const [, files] of byHash) {
    if (files.length <= 1) continue;
    const allAlready = files.every((f) => seenFileIds.has(f.fileId));
    if (allAlready) continue;
    const label =
      files.find((f) => f.partNorm)?.partNorm ||
      normalizePartIdForMatch(files[0]?.fileName) ||
      "DUPLICATE";
    duplicateGroups.push({
      normalizedPartId: label,
      files: files.map((f) => ({ fileName: f.fileName, fileId: f.fileId })),
      reason: "CONTENT_HASH",
    });
    for (const f of files) seenFileIds.add(f.fileId);
  }

  const missingDxfPartIds = uniqueMaterialPartIds.filter(
    (id) => !dxfPartIdSet.has(id)
  );
  const extraDxfPartIds = uniqueDxfPartIds.filter(
    (id) => !materialPartIdSet.has(id)
  );
  const matchedPartIds = uniqueMaterialPartIds.filter((id) =>
    dxfPartIdSet.has(id)
  );

  const conflictingPartIds: string[] = [];
  if (args.finalRows) {
    const seen = new Set<string>();
    for (const row of args.finalRows) {
      if (row.isExcluded) continue;
      if (!row.issueCodes.some((c) => CONFLICT_CODES.has(c))) continue;
      const id =
        normalizePartIdForMatch(row.part.sourcePartId) ||
        normalizePartIdForMatch(row.part.displayName);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      conflictingPartIds.push(id);
    }
  }

  const matchedFromResults = (args.resultRows ?? []).some(
    (r) => !r.excluded && r.match.status === "MATCHED"
  );
  const hasExtractedPartIdentifiers = uniqueMaterialPartIds.length > 0;
  const hasMatchedItems =
    matchedPartIds.length > 0 || matchedFromResults;
  const showMissingIdentifiersWarning =
    ready &&
    totalRows > 0 &&
    !hasExtractedPartIdentifiers &&
    !hasMatchedItems;

  const actionableDiscrepancyCount =
    missingDxfPartIds.length +
    duplicateGroups.length +
    extraDxfPartIds.length +
    conflictingPartIds.length;

  return {
    material: {
      totalRows,
      extractedIdentifierCount: rowsWithIdentifier,
      uniquePartIds: uniqueMaterialPartIds,
      rowsWithoutIdentifierCount: totalRows - rowsWithIdentifier,
    },
    dxf: {
      totalFiles: args.dxfParts.length,
      uniquePartIds: uniqueDxfPartIds,
      uniqueContentFileCount,
      exactContentDuplicateFileCount,
      duplicateGroups,
    },
    comparison: {
      matchedPartIds,
      missingDxfPartIds,
      extraDxfPartIds,
      conflictingPartIds,
    },
    actionableDiscrepancyCount,
    showMissingIdentifiersWarning,
    ready,
  };
}

export function formatHebrewCount(n: number): string {
  return n.toLocaleString("he-IL");
}

export function buildAttentionSupportingText(
  summary: IntakeAnalysisSummary
): string {
  const parts: string[] = [];
  const missing = summary.comparison.missingDxfPartIds.length;
  const extra = summary.comparison.extraDxfPartIds.length;
  const dups = summary.dxf.duplicateGroups.length;
  const conflicts = summary.comparison.conflictingPartIds.length;

  if (missing > 0) {
    parts.push(
      missing === 1
        ? "קובץ חסר אחד"
        : `${formatHebrewCount(missing)} קבצים חסרים`
    );
  }
  if (extra > 0) {
    parts.push(
      extra === 1
        ? "קובץ עודף אחד"
        : `${formatHebrewCount(extra)} עודפים`
    );
  }
  if (dups > 0) {
    parts.push(
      dups === 1
        ? "עותק כפול אחד"
        : `${formatHebrewCount(dups)} פריטים כפולים`
    );
  }
  if (conflicts > 0) {
    parts.push(
      conflicts === 1
        ? "נתון סותר אחד"
        : `${formatHebrewCount(conflicts)} נתונים סותרים`
    );
  }
  return parts.join(" · ");
}
