/**
 * Canonical source DXF filename coverage + UnifiedIntakeSummary v2.
 * Source filenames are never inferred from assigned / matched DXF files.
 */

import type { MaterialListRow } from "./materialList/types";
import {
  getEffectiveSourceDxfFileName,
  getExplicitDxfFileName,
} from "./getExplicitDxfFileName";
import {
  hasExplicitDxfFileName,
  normalizeDxfFileKey,
} from "./normalizeDxfFileKey";
import { resolveMatchLevel } from "./matchWithFilenamePriority";
import type { SimpleDxfPart, SimpleResultRow } from "./types";

export type ExplicitDxfFilenameCoverage = "NONE" | "PARTIAL" | "FULL";

export type SourceFilenameCoverageSummary = {
  totalMaterialItems: number;
  rowsWithExplicitSourceFilename: number;
  rowsWithoutExplicitSourceFilename: number;
  uniqueExplicitSourceFilenameCount: number;
  coverage: ExplicitDxfFilenameCoverage;
};

export type DxfAssignmentSummary = {
  explicitFilenameAssignments: number;
  suggestedAssignments: number;
  manualAssignments: number;
  unassignedItems: number;
};

export type UnifiedIntakeSummary = {
  material: {
    itemCount: number;
    rowsWithExplicitSourceFilename: number;
    rowsWithoutExplicitSourceFilename: number;
    uniqueExplicitSourceFilenameCount: number;
    filenameCoverage: ExplicitDxfFilenameCoverage;
  };
  uploads: {
    physicalFileCount: number;
    usableFileCount: number;
    invalidFileCount: number;
    uniqueNormalizedFilenameCount: number;
    uniqueContentFileCount: number;
    exactDuplicateFileCount: number;
  };
  references: {
    exactReferencedFilenameMatchCount: number;
    referencedFileMissingCount: number;
  };
  assignments: DxfAssignmentSummary;
  summaryReady: boolean;
  unifiedReviewReady: boolean;
  invariantFailures: string[];
};

export type UnifiedIntakeSourceNoticeKind =
  | "NO_EXPLICIT_FILENAMES"
  | "PARTIAL_FILENAME_COVERAGE"
  | "EXPLICIT_FILES_MISSING"
  | "INVALID_UPLOADED_DXF"
  | "NO_USABLE_DXF"
  | "DUPLICATE_CONTENT_FILES";

export type UnifiedIntakeSourceNotice = {
  kind: UnifiedIntakeSourceNoticeKind;
  severity: "serious" | "information";
  headingHe: string;
  bodyHe?: string;
  count?: number;
};

export type SummaryDiagnosticsV2 = {
  summaryReady: boolean;
  rawExtractionRows: number;
  rawRowsWithDxfFileName: number;
  canonicalRows: number;
  canonicalRowsWithSourceDxfFileName: number;
  unifiedItems: number;
  uploadedPhysicalFiles: number;
  uniqueNormalizedFilenameKeys: number;
  uniqueContentHashes: number;
  exactDuplicateFiles: number;
  uniqueExplicitReferencedKeys: number;
  exactReferencedMatches: number;
  missingReferencedKeys: number;
  explicitFilenameAssignments: number;
  invariantFailures: string[];
};

export type FilenameProvenanceSample = {
  rowId: string;
  extractedSourceFilename: string | null;
  userOverrideFilename: string | null;
  effectiveSourceFilename: string | null;
  assignedDxfFilename: string | null;
  normalizedSourceKey: string | null;
  uploadedFilenameMatchFound: boolean;
};

export { getEffectiveSourceDxfFileName, getExplicitDxfFileName };

export function rowHasExplicitDxfFileName(
  row: Pick<MaterialListRow, "dxfFileName" | "userOverrides">
): boolean {
  return getEffectiveSourceDxfFileName(row) != null;
}

/**
 * Prefer canonical material fields; Stage-2 extracted.dxfFileName is only a
 * SOURCE snapshot restore — never an assigned uploaded filename.
 */
export function getEffectiveSourceDxfFileNameWithSnapshot(
  row: Pick<MaterialListRow, "dxfFileName" | "userOverrides">,
  sourceSnapshotFileName?: string | null
): string | null {
  return getEffectiveSourceDxfFileName({
    materialRow: row,
    extractedDxfFileName: sourceSnapshotFileName ?? null,
  });
}

export function computeSourceFilenameCoverage(
  materialRows: ReadonlyArray<
    Pick<MaterialListRow, "dxfFileName" | "userOverrides" | "rowId">
  >,
  sourceSnapshotsByRowId?: ReadonlyMap<string, string | null>
): SourceFilenameCoverageSummary {
  const totalMaterialItems = materialRows.length;
  const effectiveNames = materialRows.map((row) =>
    getEffectiveSourceDxfFileNameWithSnapshot(
      row,
      sourceSnapshotsByRowId?.get(row.rowId)
    )
  );
  const rowsWithExplicitSourceFilename = effectiveNames.filter(
    (n): n is string => n != null
  ).length;
  const rowsWithoutExplicitSourceFilename =
    totalMaterialItems - rowsWithExplicitSourceFilename;
  const uniqueExplicitSourceFilenameCount = new Set(
    effectiveNames
      .filter((n): n is string => n != null)
      .map((n) => normalizeDxfFileKey(n))
      .filter((k) => k !== "")
  ).size;

  let coverage: ExplicitDxfFilenameCoverage = "NONE";
  if (totalMaterialItems === 0) coverage = "NONE";
  else if (rowsWithExplicitSourceFilename === 0) coverage = "NONE";
  else if (rowsWithExplicitSourceFilename < totalMaterialItems)
    coverage = "PARTIAL";
  else coverage = "FULL";

  return {
    totalMaterialItems,
    rowsWithExplicitSourceFilename,
    rowsWithoutExplicitSourceFilename,
    uniqueExplicitSourceFilenameCount,
    coverage,
  };
}

function partContentHash(
  part: Pick<SimpleDxfPart, "contentHash" | "fingerprint">
): string | null {
  const h = part.contentHash ?? part.fingerprint;
  return h && h.trim() ? h.trim() : null;
}

function partNormalizedKey(
  part: Pick<SimpleDxfPart, "normalizedFilenameKey" | "filename">
): string {
  if (part.normalizedFilenameKey?.trim()) return part.normalizedFilenameKey;
  return normalizeDxfFileKey(part.filename);
}

export function buildUnifiedIntakeSummary(args: {
  materialRows: ReadonlyArray<
    Pick<MaterialListRow, "rowId" | "dxfFileName" | "userOverrides">
  >;
  dxfParts: ReadonlyArray<
    Pick<
      SimpleDxfPart,
      | "filename"
      | "geometryStatus"
      | "contentHash"
      | "fingerprint"
      | "normalizedFilenameKey"
      | "id"
    >
  >;
  resultRows?: ReadonlyArray<SimpleResultRow>;
  summaryReady?: boolean;
}): UnifiedIntakeSummary {
  const summaryReady = args.summaryReady ?? args.materialRows.length > 0;

  const sourceSnapshotsByRowId = new Map<string, string | null>();
  for (const r of args.resultRows ?? []) {
    sourceSnapshotsByRowId.set(
      r.extracted.rowId,
      r.extracted.dxfFileName ?? null
    );
  }

  const source = computeSourceFilenameCoverage(
    args.materialRows,
    sourceSnapshotsByRowId
  );

  const physicalFileCount = args.dxfParts.length;
  const usableFileCount = args.dxfParts.filter(
    (d) => d.geometryStatus === "VALID"
  ).length;
  const invalidFileCount = args.dxfParts.filter(
    (d) => d.geometryStatus === "INVALID"
  ).length;

  const normalizedKeys = args.dxfParts
    .map(partNormalizedKey)
    .filter((k) => k !== "");
  const uniqueNormalizedFilenameCount = new Set(normalizedKeys).size;

  const contentHashes = args.dxfParts
    .map(partContentHash)
    .filter((h): h is string => h != null);
  const missingHashCount = physicalFileCount - contentHashes.length;
  const uniqueContentFileCount =
    new Set(contentHashes).size + missingHashCount;
  const exactDuplicateFileCount = Math.max(
    0,
    physicalFileCount - uniqueContentFileCount
  );

  const uniqueReferencedKeys = new Set<string>();
  for (const row of args.materialRows) {
    const name = getEffectiveSourceDxfFileNameWithSnapshot(
      row,
      sourceSnapshotsByRowId.get(row.rowId)
    );
    if (!name) continue;
    const key = normalizeDxfFileKey(name);
    if (key) uniqueReferencedKeys.add(key);
  }
  const uploadedFilenameKeys = new Set(normalizedKeys);
  const missingReferencedKeys = [...uniqueReferencedKeys].filter(
    (key) => !uploadedFilenameKeys.has(key)
  );
  const exactReferencedFilenameMatchCount = [...uniqueReferencedKeys].filter(
    (key) => uploadedFilenameKeys.has(key)
  ).length;

  const assignments = summarizeAssignments(args.resultRows ?? []);
  const invariantFailures: string[] = [];
  if (
    assignments.explicitFilenameAssignments >
    source.rowsWithExplicitSourceFilename
  ) {
    invariantFailures.push(
      "explicitFilenameMatchCount_exceeds_sourceExplicitFilenameCount"
    );
  }
  for (const r of args.resultRows ?? []) {
    if (
      r.match.method === "EXPLICIT_FILENAME" &&
      r.match.status === "MATCHED"
    ) {
      const material = args.materialRows.find(
        (m) => m.rowId === r.extracted.rowId
      );
      const src = getEffectiveSourceDxfFileNameWithSnapshot(
        material ?? { dxfFileName: null, userOverrides: {} },
        r.extracted.dxfFileName
      );
      if (!src) {
        invariantFailures.push(
          `explicit_match_without_source_filename:${r.extracted.rowId}`
        );
      }
    }
  }

  return {
    material: {
      itemCount: source.totalMaterialItems,
      rowsWithExplicitSourceFilename: source.rowsWithExplicitSourceFilename,
      rowsWithoutExplicitSourceFilename:
        source.rowsWithoutExplicitSourceFilename,
      uniqueExplicitSourceFilenameCount:
        source.uniqueExplicitSourceFilenameCount,
      filenameCoverage: source.coverage,
    },
    uploads: {
      physicalFileCount,
      usableFileCount,
      invalidFileCount,
      uniqueNormalizedFilenameCount,
      uniqueContentFileCount,
      exactDuplicateFileCount,
    },
    references: {
      exactReferencedFilenameMatchCount,
      referencedFileMissingCount: missingReferencedKeys.length,
    },
    assignments,
    summaryReady,
    unifiedReviewReady: summaryReady && source.totalMaterialItems > 0,
    invariantFailures,
  };
}

function summarizeAssignments(
  resultRows: ReadonlyArray<SimpleResultRow>
): DxfAssignmentSummary {
  let explicitFilenameAssignments = 0;
  let suggestedAssignments = 0;
  let manualAssignments = 0;
  let unassignedItems = 0;
  for (const r of resultRows) {
    if (r.excluded) continue;
    const level = resolveMatchLevel(r.match);
    if (r.match.method === "MANUAL" && r.match.matchedDxfId) {
      manualAssignments++;
      continue;
    }
    if (r.match.method === "EXPLICIT_FILENAME" && r.match.status === "MATCHED") {
      explicitFilenameAssignments++;
      continue;
    }
    if (level === "SUGGESTED") {
      suggestedAssignments++;
      continue;
    }
    if (level === "UNASSIGNED") unassignedItems++;
  }
  return {
    explicitFilenameAssignments,
    suggestedAssignments,
    manualAssignments,
    unassignedItems,
  };
}

export function buildUnifiedIntakeSourceNotices(
  summary: UnifiedIntakeSummary
): UnifiedIntakeSourceNotice[] {
  if (!summary.summaryReady) return [];
  const notices: UnifiedIntakeSourceNotice[] = [];

  if (
    summary.material.itemCount > 0 &&
    summary.material.filenameCoverage === "NONE" &&
    summary.material.rowsWithExplicitSourceFilename === 0
  ) {
    if (
      !summary.invariantFailures.some((f) =>
        f.startsWith("explicit_match_without_source_filename")
      )
    ) {
      notices.push({
        kind: "NO_EXPLICIT_FILENAMES",
        severity: "serious",
        headingHe: "לא נמצאו שמות קובצי DXF ברשימת החומר",
        bodyHe:
          "כדי להתאים כל פריט לקובץ הנכון באופן מדויק, יש לכלול ברשימה את שם קובץ ה-DXF המתאים. המערכת תנסה לבצע התאמה לפי המידות והנתונים הקיימים, אך חלק מההתאמות עשויות לדרוש בדיקה.",
      });
    }
  }

  if (summary.material.filenameCoverage === "PARTIAL") {
    const n = summary.material.rowsWithoutExplicitSourceFilename;
    notices.push({
      kind: "PARTIAL_FILENAME_COVERAGE",
      severity: "information",
      headingHe: `ל-${summary.material.rowsWithExplicitSourceFilename.toLocaleString("he-IL")} מתוך ${summary.material.itemCount.toLocaleString("he-IL")} פריטים צוין שם DXF. ל-${n.toLocaleString("he-IL")} פריטים לא צוין שם — עבורם תתבצע התאמה משוערת.`,
    });
  }

  if (summary.references.referencedFileMissingCount > 0) {
    const n = summary.references.referencedFileMissingCount;
    notices.push({
      kind: "EXPLICIT_FILES_MISSING",
      severity: "serious",
      headingHe: `${n.toLocaleString("he-IL")} שמות DXF ברשימה ללא קובץ שהועלה`,
      bodyHe:
        "ברשימת החומר מופיעים שמות קבצים, אך לא נמצא קובץ פיזי תואם בין הקבצים שהועלו.",
      count: n,
    });
  }

  if (summary.uploads.invalidFileCount > 0) {
    const n = summary.uploads.invalidFileCount;
    notices.push({
      kind: "INVALID_UPLOADED_DXF",
      severity: "serious",
      headingHe: `${n.toLocaleString("he-IL")} קובצי DXF שהועלו אינם ניתנים לשימוש`,
      count: n,
    });
  }

  if (
    summary.uploads.physicalFileCount > 0 &&
    summary.uploads.usableFileCount === 0
  ) {
    notices.push({
      kind: "NO_USABLE_DXF",
      severity: "serious",
      headingHe: "אין קובצי DXF תקינים לשימוש",
      bodyHe: "ניתן לפתוח את טבלת הבדיקה המאוחדת כדי לראות את מצב הפריטים.",
    });
  }

  if (summary.uploads.exactDuplicateFileCount > 0) {
    const n = summary.uploads.exactDuplicateFileCount;
    notices.push({
      kind: "DUPLICATE_CONTENT_FILES",
      severity: "information",
      headingHe: `${n.toLocaleString("he-IL")} קובץ כפול בתוכן (עותק מדויק)`,
      bodyHe: `${summary.uploads.physicalFileCount.toLocaleString("he-IL")} קבצים הועלו · ${summary.uploads.uniqueContentFileCount.toLocaleString("he-IL")} תכנים ייחודיים`,
      count: n,
    });
  }

  return notices;
}

export function buildSummaryDiagnosticsV2(args: {
  summary: UnifiedIntakeSummary;
  rawExtractionRows?: ReadonlyArray<{ dxfFileName?: string | null }>;
  materialRows: ReadonlyArray<
    Pick<MaterialListRow, "dxfFileName" | "userOverrides">
  >;
  unifiedItemCount: number;
}): SummaryDiagnosticsV2 {
  const raw = args.rawExtractionRows ?? [];
  return {
    summaryReady: args.summary.summaryReady,
    rawExtractionRows: raw.length,
    rawRowsWithDxfFileName: raw.filter((r) =>
      hasExplicitDxfFileName(r.dxfFileName)
    ).length,
    canonicalRows: args.materialRows.length,
    canonicalRowsWithSourceDxfFileName: args.materialRows.filter((r) =>
      Boolean(getEffectiveSourceDxfFileName(r))
    ).length,
    unifiedItems: args.unifiedItemCount,
    uploadedPhysicalFiles: args.summary.uploads.physicalFileCount,
    uniqueNormalizedFilenameKeys:
      args.summary.uploads.uniqueNormalizedFilenameCount,
    uniqueContentHashes: args.summary.uploads.uniqueContentFileCount,
    exactDuplicateFiles: args.summary.uploads.exactDuplicateFileCount,
    uniqueExplicitReferencedKeys:
      args.summary.material.uniqueExplicitSourceFilenameCount,
    exactReferencedMatches:
      args.summary.references.exactReferencedFilenameMatchCount,
    missingReferencedKeys: args.summary.references.referencedFileMissingCount,
    explicitFilenameAssignments:
      args.summary.assignments.explicitFilenameAssignments,
    invariantFailures: args.summary.invariantFailures,
  };
}

export function buildFilenameProvenanceSample(args: {
  materialRows: ReadonlyArray<
    Pick<MaterialListRow, "rowId" | "dxfFileName" | "userOverrides">
  >;
  dxfParts: ReadonlyArray<
    Pick<SimpleDxfPart, "filename" | "normalizedFilenameKey" | "id">
  >;
  resultRows?: ReadonlyArray<SimpleResultRow>;
  limit?: number;
}): FilenameProvenanceSample[] {
  const limit = args.limit ?? 10;
  const uploadedKeys = new Set(
    args.dxfParts.map(partNormalizedKey).filter((k) => k !== "")
  );
  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  const resultById = new Map(
    (args.resultRows ?? []).map((r) => [r.extracted.rowId, r])
  );
  const out: FilenameProvenanceSample[] = [];
  for (const row of args.materialRows) {
    if (out.length >= limit) break;
    const override = Object.prototype.hasOwnProperty.call(
      row.userOverrides ?? {},
      "dxfFileName"
    )
      ? row.userOverrides.dxfFileName?.trim() || null
      : null;
    const extracted = row.dxfFileName?.trim() || null;
    const snap = resultById.get(row.rowId)?.extracted.dxfFileName ?? null;
    const effective = getEffectiveSourceDxfFileNameWithSnapshot(row, snap);
    const key = effective ? normalizeDxfFileKey(effective) || null : null;
    const result = resultById.get(row.rowId);
    const assignedId = result?.match.matchedDxfId ?? null;
    const assigned = assignedId
      ? (dxfById.get(assignedId)?.filename ?? null)
      : null;
    out.push({
      rowId: row.rowId,
      extractedSourceFilename: extracted,
      userOverrideFilename: override,
      effectiveSourceFilename: effective,
      assignedDxfFilename: assigned,
      normalizedSourceKey: key,
      uploadedFilenameMatchFound: Boolean(key && uploadedKeys.has(key)),
    });
  }
  return out;
}

export function resolveLinkedItemExplicitFilename(args: {
  materialRow: MaterialListRow;
  resultRow?: SimpleResultRow | null;
}): string | null {
  return getEffectiveSourceDxfFileNameWithSnapshot(
    args.materialRow,
    args.resultRow?.extracted.dxfFileName
  );
}

export function getEffectiveExplicitDxfFileName(
  item:
    | Pick<MaterialListRow, "dxfFileName" | "userOverrides">
    | {
        materialRow: Pick<MaterialListRow, "dxfFileName" | "userOverrides">;
        /** Already-resolved source name (never an assigned upload name). */
        extractedDxfFileName?: string | null;
      }
): string | null {
  if ("materialRow" in item && item.materialRow) {
    return getEffectiveSourceDxfFileNameWithSnapshot(
      item.materialRow,
      item.extractedDxfFileName
    );
  }
  return getEffectiveSourceDxfFileName(
    item as Pick<MaterialListRow, "dxfFileName" | "userOverrides">
  );
}
