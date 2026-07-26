/**
 * Filename-first DXF matching — wraps existing heuristic matcher unchanged.
 *
 * Priority:
 * 1. Exact normalized filename → CERTAIN
 * 2. Explicit filename, file not uploaded → MISSING_EXPLICIT
 * 3. Duplicate uploaded filenames → DUPLICATE (user selection)
 * 4. No filename → existing matchSimpleRows → SUGGESTED / UNASSIGNED
 */

import { normalizeDxfFileKey, hasExplicitDxfFileName } from "./normalizeDxfFileKey";
import {
  deriveResultRowStatus,
  deriveSimpleDxfAvailability,
  matchSimpleRows,
} from "./matchSimpleRows";
import { classifyDxfDuplicates } from "./classifyDxfDuplicates";
import {
  assignmentSourceFromMatch,
  buildReservedDxfIds,
  buildSmartSuggestionDiagnostics,
  type CandidateSuggestionSampleRow,
  type SmartSuggestionDiagnostics,
} from "./smartDxfAssignment";
import type {
  SimpleDxfAvailabilityItem,
  SimpleDxfPart,
  SimpleExtractedRow,
  SimpleIntakeResultSummary,
  SimpleMatchCandidate,
  SimpleMatchResult,
  SimpleMatchingDiagnostics,
  SimpleResultRow,
} from "./types";

export type DxfMatchLevel = "CERTAIN" | "SUGGESTED" | "UNASSIGNED";

export type FilenameMatchKind =
  | "CERTAIN_FILENAME"
  | "MISSING_EXPLICIT_FILE"
  | "DUPLICATE_FILENAME"
  | "HEURISTIC"
  | "MANUAL"
  | "NONE";

export type DxfFilenameMatchingDebug = {
  totalItemCount: number;
  itemsWithExplicitFilename: number;
  itemsWithoutExplicitFilename: number;
  certainFilenameMatches: number;
  suggestedMatches: number;
  unassignedItems: number;
  explicitMissingFiles: number;
  duplicateFilenameConflicts: number;
  unmatchedUploadedDxfs: number;
};

export type ItemFilenameMatchDebug = {
  extractedDxfFileName: string | null;
  normalizedDxfKey: string | null;
  matchedUploadedDxfName: string | null;
  matchLevel: DxfMatchLevel;
  filenameMatchKind: FilenameMatchKind;
};

export const DXF_MATCH_LEVEL_HE: Record<DxfMatchLevel, string> = {
  CERTAIN: "התאמה ודאית",
  SUGGESTED: "התאמה מוצעת",
  UNASSIGNED: "לא שויך",
};

function toCandidate(dxf: SimpleDxfPart): SimpleMatchCandidate {
  return {
    dxfId: dxf.id,
    partId: dxf.partId,
    filename: dxf.filename,
    widthMm: dxf.widthMm,
    lengthMm: dxf.lengthMm,
    widthDifferenceMm: null,
    lengthDifferenceMm: null,
    totalScore: null,
    rotated: false,
  };
}

function emptyResultRow(
  row: SimpleExtractedRow,
  match: SimpleMatchResult
): SimpleResultRow {
  const resultRow: SimpleResultRow = {
    resultRowId: `res_${row.rowId}`,
    extracted: row,
    match,
    status: "NEEDS_DXF",
    excluded: false,
    edits: {},
  };
  resultRow.status = deriveResultRowStatus(resultRow);
  return resultRow;
}

export function resolveMatchLevel(
  match: SimpleMatchResult
): DxfMatchLevel {
  if (match.status === "MATCHED" && match.matchedDxfId) {
    // Exact unique identifiers (filename or part id) are certain — no manual confirm.
    // Geometry-only suggestions remain SUGGESTED until confirmed.
    if (
      match.method === "EXPLICIT_FILENAME" ||
      match.method === "MANUAL" ||
      match.method === "EXACT_ID"
    ) {
      return "CERTAIN";
    }
    return "SUGGESTED";
  }
  return "UNASSIGNED";
}

export function resolveFilenameMatchKind(
  match: SimpleMatchResult
): FilenameMatchKind {
  if (match.method === "MANUAL") return "MANUAL";
  if (match.method === "EXPLICIT_FILENAME") {
    if (match.status === "MATCHED") return "CERTAIN_FILENAME";
    if (match.status === "AMBIGUOUS") return "DUPLICATE_FILENAME";
    if (match.status === "UNMATCHED") return "MISSING_EXPLICIT_FILE";
  }
  if (match.method === "EXACT_ID" && match.status === "MATCHED") {
    return "CERTAIN_FILENAME";
  }
  if (match.method === "GEOMETRY") {
    return "HEURISTIC";
  }
  return "NONE";
}

/**
 * Run filename-priority matching, then heuristic for remaining items/files.
 */
export function matchWithFilenamePriority(args: {
  extractedRows: SimpleExtractedRow[];
  dxfParts: SimpleDxfPart[];
  extractedRowCount?: number;
  confirmedManualMatchIds?: ReadonlySet<string>;
}): {
  resultRows: SimpleResultRow[];
  unmatchedDxfIds: string[];
  dxfAvailability: SimpleDxfAvailabilityItem[];
  localSummary: SimpleIntakeResultSummary;
  diagnostics: SimpleMatchingDiagnostics;
  filenameMatchingDebug: DxfFilenameMatchingDebug;
  itemFilenameDebug: Record<string, ItemFilenameMatchDebug>;
  smartSuggestionDiagnostics: SmartSuggestionDiagnostics;
  candidateSuggestionSample: CandidateSuggestionSampleRow[];
} {
  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  const classified = classifyDxfDuplicates(args.dxfParts, {
    sourceRows: args.extractedRows,
  });
  const secondaryIds = classified.secondaryDuplicateFileIds;

  const byKey = new Map<string, SimpleDxfPart[]>();
  for (const dxf of args.dxfParts) {
    if (dxf.geometryStatus === "INVALID") continue;
    // Identical content duplicates: keep only the canonical instance for matching.
    if (secondaryIds.has(dxf.id)) continue;
    const key = normalizeDxfFileKey(dxf.filename);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(dxf);
    byKey.set(key, list);
  }

  // Same-name different-content: include all conflicting uploads for review.
  for (const group of classified.groups) {
    if (group.classification !== "SAME_NAME_DIFFERENT_CONTENT") continue;
    const key = group.files[0]?.normalizedFileNameKey;
    if (!key) continue;
    const parts = group.files
      .map((f) => dxfById.get(f.fileId))
      .filter((d): d is SimpleDxfPart => d != null && d.geometryStatus === "VALID");
    if (parts.length > 1) byKey.set(key, parts);
  }

  const usedDxfIds = new Set<string>();
  const filenameResults = new Map<string, SimpleResultRow>();
  const heuristicRows: SimpleExtractedRow[] = [];

  let certainFilenameMatches = 0;
  let explicitMissingFiles = 0;
  let duplicateFilenameConflicts = 0;
  let itemsWithExplicitFilename = 0;

  for (const row of args.extractedRows) {
    const rawName = row.dxfFileName ?? null;
    if (!hasExplicitDxfFileName(rawName)) {
      heuristicRows.push(row);
      continue;
    }
    itemsWithExplicitFilename++;
    const key = normalizeDxfFileKey(rawName!);
    const matches = (byKey.get(key) ?? []).filter(
      (d) => !usedDxfIds.has(d.id)
    );
    const allWithKey = byKey.get(key) ?? [];

    if (allWithKey.length > 1) {
      // Same-name different content — require review; do not auto-pick.
      duplicateFilenameConflicts++;
      const match: SimpleMatchResult = {
        status: "AMBIGUOUS",
        method: "EXPLICIT_FILENAME",
        matchedDxfId: null,
        candidates: allWithKey.map(toCandidate),
        message: "DUPLICATE_FILENAME",
      };
      filenameResults.set(row.rowId, emptyResultRow(row, match));
      continue;
    }

    if (matches.length === 1) {
      const dxf = matches[0]!;
      usedDxfIds.add(dxf.id);
      certainFilenameMatches++;
      const match: SimpleMatchResult = {
        status: "MATCHED",
        method: "EXPLICIT_FILENAME",
        matchedDxfId: dxf.id,
        candidates: [toCandidate(dxf)],
        message: null,
      };
      filenameResults.set(row.rowId, emptyResultRow(row, match));
      continue;
    }

    // Explicit name, no uploaded file with that key — do not geometry-substitute.
    explicitMissingFiles++;
    const match: SimpleMatchResult = {
      status: "UNMATCHED",
      method: "EXPLICIT_FILENAME",
      matchedDxfId: null,
      candidates: [],
      message: `MISSING_EXPLICIT_DXF:${rawName}`,
    };
    filenameResults.set(row.rowId, emptyResultRow(row, match));
  }

  const remainingDxfs = args.dxfParts.filter(
    (d) => !usedDxfIds.has(d.id) && !secondaryIds.has(d.id)
  );
  const heuristic = matchSimpleRows({
    extractedRows: heuristicRows,
    dxfParts: remainingDxfs,
    extractedRowCount: args.extractedRowCount ?? args.extractedRows.length,
  });

  // Preserve original extracted row order.
  const resultRows: SimpleResultRow[] = args.extractedRows.map((row) => {
    const fromFilename = filenameResults.get(row.rowId);
    if (fromFilename) return fromFilename;
    const fromHeuristic = heuristic.resultRows.find(
      (r) => r.extracted.rowId === row.rowId
    );
    if (fromHeuristic) return fromHeuristic;
    return emptyResultRow(row, {
      status: "UNMATCHED",
      method: null,
      matchedDxfId: null,
      candidates: [],
      message: null,
    });
  });

  // Invariant: certain/manual assignments must keep their method (not GEOMETRY).
  for (const row of resultRows) {
    if (
      row.match.status === "MATCHED" &&
      (row.match.method === "EXPLICIT_FILENAME" ||
        row.match.method === "EXACT_ID" ||
        row.match.method === "MANUAL") &&
      !row.match.matchedDxfId
    ) {
      console.warn(
        "[omega] exact/manual MATCHED without matchedDxfId",
        row.extracted.rowId
      );
    }
  }

  const reservedDxfIds = buildReservedDxfIds({
    resultRows,
    confirmedManualMatchIds: args.confirmedManualMatchIds,
  });

  const {
    smartSuggestionDiagnostics,
    candidateSuggestionSample,
  } = buildSmartSuggestionDiagnostics({
    extractedRows: args.extractedRows,
    resultRows,
    dxfParts: args.dxfParts,
    secondaryDuplicateFileIds: secondaryIds,
    reservedDxfIds,
    confirmedManualMatchIds: args.confirmedManualMatchIds,
  });

  const dxfAvailability = deriveSimpleDxfAvailability({
    dxfParts: args.dxfParts,
    resultRows,
    coverageIssues: [],
  });
  const unmatchedDxfIds = dxfAvailability
    .filter((d) => d.state === "UNUSED")
    .map((d) => d.dxfId);

  let suggestedMatches = 0;
  let unassignedItems = 0;
  const itemFilenameDebug: Record<string, ItemFilenameMatchDebug> = {};

  for (const r of resultRows) {
    const level = resolveMatchLevel(r.match);
    const kind = resolveFilenameMatchKind(r.match);
    if (level === "SUGGESTED") suggestedMatches++;
    if (level === "UNASSIGNED") unassignedItems++;

    const extracted = r.extracted.dxfFileName ?? null;
    const key = hasExplicitDxfFileName(extracted)
      ? normalizeDxfFileKey(extracted!)
      : null;
    const matched = r.match.matchedDxfId
      ? (dxfById.get(r.match.matchedDxfId)?.filename ?? null)
      : null;

    itemFilenameDebug[r.extracted.rowId] = {
      extractedDxfFileName: extracted,
      normalizedDxfKey: key,
      matchedUploadedDxfName: matched,
      matchLevel: level,
      filenameMatchKind: kind,
    };
  }

  const filenameMatchingDebug: DxfFilenameMatchingDebug = {
    totalItemCount: args.extractedRows.length,
    itemsWithExplicitFilename,
    itemsWithoutExplicitFilename:
      args.extractedRows.length - itemsWithExplicitFilename,
    certainFilenameMatches,
    suggestedMatches,
    unassignedItems,
    explicitMissingFiles,
    duplicateFilenameConflicts,
    unmatchedUploadedDxfs: unmatchedDxfIds.length,
  };

  // Merge diagnostics — keep heuristic diagnostics, note filename phase.
  const diagnostics: SimpleMatchingDiagnostics = {
    ...heuristic.diagnostics,
    unmatchedReasons: [
      ...heuristic.diagnostics.unmatchedReasons,
      ...[...filenameResults.values()]
        .filter((r) => r.match.status === "UNMATCHED")
        .map((r) => ({
          rowId: r.extracted.rowId,
          reason: "NO_ELIGIBLE_CANDIDATE" as const,
        })),
    ],
  };

  void assignmentSourceFromMatch;

  return {
    resultRows,
    unmatchedDxfIds,
    dxfAvailability,
    localSummary: heuristic.localSummary,
    diagnostics,
    filenameMatchingDebug,
    itemFilenameDebug,
    smartSuggestionDiagnostics,
    candidateSuggestionSample,
  };
}

export function buildFilenameCoverageNotice(args: {
  totalItemCount: number;
  itemsWithExplicitFilename: number;
}):
  | { kind: "NONE" }
  | {
      kind: "NO_FILENAMES";
      headingHe: string;
      bodyHe: string;
      continueLabelHe: string;
      backLabelHe: string;
    }
  | { kind: "PARTIAL"; messageHe: string } {
  const { totalItemCount, itemsWithExplicitFilename } = args;
  if (totalItemCount <= 0 || itemsWithExplicitFilename === totalItemCount) {
    return { kind: "NONE" };
  }
  if (itemsWithExplicitFilename === 0) {
    return {
      kind: "NO_FILENAMES",
      headingHe: "לא נמצאו שמות קובצי DXF ברשימת החומר",
      bodyHe:
        "כדי לשייך כל פריט לקובץ הנכון, יש לכלול ברשימה את שם קובץ ה-DXF או מזהה הפריט התואם. המערכת משייכת רק לפי מזהה מדויק — לא לפי מידות.",
      continueLabelHe: "המשך",
      backLabelHe: "חזרה לרשימת החומר",
    };
  }
  const without = totalItemCount - itemsWithExplicitFilename;
  return {
    kind: "PARTIAL",
    messageHe: `ל-${without} מתוך ${totalItemCount} פריטים לא צוין שם DXF. עבורם תתבצע התאמה לפי מזהה פריט בלבד, אם קיים.`,
  };
}
