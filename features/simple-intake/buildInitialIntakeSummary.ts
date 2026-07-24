/**
 * Initial intake summary — derived from unified quote items + DXF registry.
 * Same effective source filename selector as the unified table.
 */

import type { MaterialListRow } from "./materialList/types";
import {
  getEffectiveSourceDxfFileName,
  type SourceDxfFilenameCarrier,
} from "./getExplicitDxfFileName";
import {
  hasExplicitDxfFileName,
  normalizeDxfFileKey,
} from "./normalizeDxfFileKey";
import type { SimpleDxfPart } from "./types";

export type InitialIntakeFilenameCoverage = "NONE" | "PARTIAL" | "FULL";

export type InitialIntakeSummary = {
  material: {
    itemCount: number;
    rowsWithExplicitSourceFilename: number;
    rowsWithoutExplicitSourceFilename: number;
    uniqueReferencedFilenameCount: number;
    filenameCoverage: InitialIntakeFilenameCoverage;
  };
  uploads: {
    physicalFileCount: number;
    usableFileCount: number;
    invalidFileCount: number;
    uniqueContentFileCount: number;
    exactDuplicateFileCount: number;
    uniqueNormalizedFilenameCount: number;
    ambiguousDuplicateFilenameKeyCount: number;
  };
  references: {
    uploadedReferencedFilenameCount: number;
    missingReferencedFilenameCount: number;
  };
  ready: boolean;
  unifiedReviewReady: boolean;
};

export type InitialIntakeNoticeKind =
  | "NO_EXPLICIT_FILENAMES"
  | "PARTIAL_FILENAME_COVERAGE"
  | "EXPLICIT_FILES_MISSING"
  | "INVALID_UPLOADED_DXF"
  | "NO_USABLE_DXF"
  | "AMBIGUOUS_DUPLICATE_FILENAME_KEYS";

export type InitialIntakeNotice = {
  kind: InitialIntakeNoticeKind;
  severity: "serious" | "information";
  headingHe: string;
  bodyHe?: string;
  count?: number;
};

export type FilenameFlowDiagnostics = {
  summaryReady: boolean;
  rawExtractionRows: number;
  rawRowsWithDxfFilename: number;
  canonicalRows: number;
  canonicalRowsWithDxfFilename: number;
  unifiedItems: number;
  unifiedItemsWithSourceDxfFilename: number;
  noticeConditionResult: boolean;
};

export type FilenameFlowSample = {
  rowId: string;
  extractedFilename: string | null;
  overrideFilename: string | null;
  effectiveSourceFilename: string | null;
  assignedDxfFilename: string | null;
};

export type UnifiedQuoteItemLike = {
  materialRow: MaterialListRow;
  extractedDxfFileName: string | null;
  matchedFilename?: string | null;
};

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

function isUsableDxf(
  part: Pick<SimpleDxfPart, "geometryStatus">
): boolean {
  return part.geometryStatus === "VALID";
}

export function buildInitialIntakeSummary(args: {
  unifiedItems: ReadonlyArray<SourceDxfFilenameCarrier & { materialRow?: MaterialListRow }>;
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
  ready?: boolean;
}): InitialIntakeSummary {
  const ready = args.ready ?? args.unifiedItems.length > 0;
  const materialItemCount = args.unifiedItems.length;

  const effectiveNames = args.unifiedItems.map((item) =>
    getEffectiveSourceDxfFileName(item)
  );
  const rowsWithExplicitSourceFilename = effectiveNames.filter(
    (n): n is string => n != null
  ).length;
  const rowsWithoutExplicitSourceFilename =
    materialItemCount - rowsWithExplicitSourceFilename;

  const uniqueReferencedFilenameKeys = new Set(
    effectiveNames
      .filter((n): n is string => n != null)
      .map((n) => normalizeDxfFileKey(n))
      .filter((k) => k !== "")
  );

  let filenameCoverage: InitialIntakeFilenameCoverage = "NONE";
  if (materialItemCount === 0) filenameCoverage = "NONE";
  else if (rowsWithExplicitSourceFilename === 0) filenameCoverage = "NONE";
  else if (rowsWithExplicitSourceFilename < materialItemCount)
    filenameCoverage = "PARTIAL";
  else filenameCoverage = "FULL";

  const physicalFileCount = args.dxfParts.length;
  const usableFileCount = args.dxfParts.filter(isUsableDxf).length;
  const invalidFileCount = args.dxfParts.filter(
    (d) => d.geometryStatus === "INVALID"
  ).length;

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

  const allNormKeys = args.dxfParts
    .map(partNormalizedKey)
    .filter((k) => k !== "");
  const uniqueNormalizedFilenameCount = new Set(allNormKeys).size;

  const usableKeyCounts = new Map<string, number>();
  for (const part of args.dxfParts) {
    if (!isUsableDxf(part)) continue;
    const key = partNormalizedKey(part);
    if (!key) continue;
    usableKeyCounts.set(key, (usableKeyCounts.get(key) ?? 0) + 1);
  }
  let ambiguousDuplicateFilenameKeyCount = 0;
  for (const count of usableKeyCounts.values()) {
    if (count > 1) ambiguousDuplicateFilenameKeyCount++;
  }

  const uploadedFilenameKeys = new Set(usableKeyCounts.keys());
  const missingReferencedFilenameKeys = [
    ...uniqueReferencedFilenameKeys,
  ].filter((key) => !uploadedFilenameKeys.has(key));
  const uploadedReferencedFilenameCount = [
    ...uniqueReferencedFilenameKeys,
  ].filter((key) => uploadedFilenameKeys.has(key)).length;

  return {
    material: {
      itemCount: materialItemCount,
      rowsWithExplicitSourceFilename,
      rowsWithoutExplicitSourceFilename,
      uniqueReferencedFilenameCount: uniqueReferencedFilenameKeys.size,
      filenameCoverage,
    },
    uploads: {
      physicalFileCount,
      usableFileCount,
      invalidFileCount,
      uniqueContentFileCount,
      exactDuplicateFileCount,
      uniqueNormalizedFilenameCount,
      ambiguousDuplicateFilenameKeyCount,
    },
    references: {
      uploadedReferencedFilenameCount,
      missingReferencedFilenameCount: missingReferencedFilenameKeys.length,
    },
    ready,
    unifiedReviewReady: ready && materialItemCount > 0,
  };
}

/**
 * Serious / informational source-level notices only.
 * Exact content duplicates are presented in the visual summary, not here.
 */
export function buildInitialIntakeNotices(
  summary: InitialIntakeSummary
): InitialIntakeNotice[] {
  if (!summary.ready) return [];

  const notices: InitialIntakeNotice[] = [];
  const rowsWith = summary.material.rowsWithExplicitSourceFilename;

  // Defensive: never emit no-filenames when any explicit source name exists.
  const mayShowNoFilenames =
    summary.material.itemCount > 0 &&
    summary.material.filenameCoverage === "NONE" &&
    rowsWith === 0;

  if (mayShowNoFilenames) {
    notices.push({
      kind: "NO_EXPLICIT_FILENAMES",
      severity: "serious",
      headingHe: "לא נמצאו שמות קובצי DXF ברשימת החומר",
      bodyHe:
        "כדי להתאים כל פריט לקובץ הנכון באופן מדויק, יש לכלול ברשימה את שם קובץ ה-DXF המתאים. המערכת תנסה לבצע התאמה לפי המידות והנתונים הקיימים, אך חלק מההתאמות עשויות לדרוש בדיקה.",
    });
  }

  if (summary.material.filenameCoverage === "PARTIAL" && rowsWith > 0) {
    const n = summary.material.rowsWithoutExplicitSourceFilename;
    notices.push({
      kind: "PARTIAL_FILENAME_COVERAGE",
      severity: "information",
      headingHe: `ל-${summary.material.rowsWithExplicitSourceFilename.toLocaleString("he-IL")} מתוך ${summary.material.itemCount.toLocaleString("he-IL")} פריטים צוין שם DXF. ל-${n.toLocaleString("he-IL")} פריטים לא צוין שם — עבורם תתבצע התאמה משוערת.`,
    });
  }

  if (summary.references.missingReferencedFilenameCount > 0) {
    const n = summary.references.missingReferencedFilenameCount;
    notices.push({
      kind: "EXPLICIT_FILES_MISSING",
      severity: "serious",
      headingHe: `${n.toLocaleString("he-IL")} שמות DXF ברשימה ללא קובץ שהועלה`,
      bodyHe:
        "ברשימת החומר מופיעים שמות קבצים, אך לא נמצא קובץ פיזי תואם בין הקבצים שהועלו. הפריטים יופיעו בטבלת הבדיקה המאוחדת.",
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

  if (summary.uploads.ambiguousDuplicateFilenameKeyCount > 0) {
    const n = summary.uploads.ambiguousDuplicateFilenameKeyCount;
    notices.push({
      kind: "AMBIGUOUS_DUPLICATE_FILENAME_KEYS",
      severity: "serious",
      headingHe: `${n.toLocaleString("he-IL")} שמות קובץ כפולים בין הקבצים שהועלו`,
      bodyHe:
        "כמה קבצים חולקים אותו שם מנורמל — יש לבחור את הקובץ הנכון בטבלת הבדיקה.",
      count: n,
    });
  }

  return notices;
}

/** Defensive filter — never show no-filenames when any source name exists. */
export function filterInitialIntakeNotices(
  summary: InitialIntakeSummary,
  notices: InitialIntakeNotice[]
): InitialIntakeNotice[] {
  if (!summary.ready) return [];
  return notices.filter((n) => {
    if (n.kind !== "NO_EXPLICIT_FILENAMES") return true;
    return (
      summary.material.itemCount > 0 &&
      summary.material.rowsWithExplicitSourceFilename === 0 &&
      summary.material.filenameCoverage === "NONE"
    );
  });
}

export function buildFilenameFlowDiagnostics(args: {
  summary: InitialIntakeSummary;
  rawExtractionRows?: ReadonlyArray<{ dxfFileName?: string | null }>;
  canonicalRows: ReadonlyArray<
    Pick<MaterialListRow, "dxfFileName" | "userOverrides">
  >;
  unifiedItems: ReadonlyArray<SourceDxfFilenameCarrier>;
}): FilenameFlowDiagnostics {
  const raw = args.rawExtractionRows ?? [];
  const unifiedWith = args.unifiedItems.filter((i) =>
    Boolean(getEffectiveSourceDxfFileName(i))
  ).length;
  const noticeConditionResult =
    args.summary.ready &&
    args.summary.material.itemCount > 0 &&
    args.summary.material.rowsWithExplicitSourceFilename === 0;

  return {
    summaryReady: args.summary.ready,
    rawExtractionRows: raw.length,
    rawRowsWithDxfFilename: raw.filter((r) =>
      hasExplicitDxfFileName(r.dxfFileName)
    ).length,
    canonicalRows: args.canonicalRows.length,
    canonicalRowsWithDxfFilename: args.canonicalRows.filter((r) =>
      Boolean(getEffectiveSourceDxfFileName(r))
    ).length,
    unifiedItems: args.unifiedItems.length,
    unifiedItemsWithSourceDxfFilename: unifiedWith,
    noticeConditionResult,
  };
}

export function buildFilenameFlowSample(args: {
  unifiedItems: ReadonlyArray<UnifiedQuoteItemLike>;
  limit?: number;
}): FilenameFlowSample[] {
  const limit = args.limit ?? 10;
  const out: FilenameFlowSample[] = [];
  for (const item of args.unifiedItems) {
    if (out.length >= limit) break;
    const row = item.materialRow;
    const override = Object.prototype.hasOwnProperty.call(
      row.userOverrides ?? {},
      "dxfFileName"
    )
      ? row.userOverrides.dxfFileName?.trim() || null
      : null;
    out.push({
      rowId: row.rowId,
      extractedFilename: row.dxfFileName?.trim() || null,
      overrideFilename: override,
      effectiveSourceFilename: getEffectiveSourceDxfFileName(item),
      assignedDxfFilename: item.matchedFilename?.trim() || null,
    });
  }
  return out;
}
