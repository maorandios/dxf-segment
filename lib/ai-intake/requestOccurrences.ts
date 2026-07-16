import { normalizePartId } from "./normalizePartId";
import { hasBlockingGeometryIssue } from "./compareDocumentDxfGeometry";
import type {
  DuplicateOccurrenceStatus,
  DuplicateUserAction,
  ExtractedDocumentRow,
  ExtractedRequestFact,
  FinalIntakeMappingRow,
  RequestPartOccurrence,
} from "./schemas";

function commercialKey(o: {
  quantity: number | null;
  thicknessMm: number | null;
  material: string | null;
  action: "INCLUDE" | "EXCLUDE" | null;
}): string {
  const mat =
    typeof o.material === "string" ? o.material.trim().toLowerCase() : "";
  return [
    o.quantity ?? "",
    o.thicknessMm ?? "",
    mat,
    o.action ?? "",
  ].join("|");
}

function valuesEqualNum(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

export function buildOccurrenceId(
  row: ExtractedDocumentRow,
  pdfItemIndex?: number
): string {
  const parts: string[] = [row.documentId];
  if (row.source.sheetName) {
    parts.push(`sheet:${row.source.sheetName}`);
  }
  if (row.source.rowNumber != null) {
    parts.push(`row:${row.source.rowNumber}`);
  }
  if (row.source.pageNumber != null) {
    parts.push(`page:${row.source.pageNumber}`);
  }
  if (
    row.source.type === "PDF" &&
    row.source.rowNumber == null &&
    pdfItemIndex != null
  ) {
    parts.push(`item:${pdfItemIndex}`);
  }
  if (
    !row.source.sheetName &&
    row.source.rowNumber == null &&
    row.source.pageNumber == null &&
    pdfItemIndex == null
  ) {
    parts.push(
      `ref:${row.rawPartReference ?? row.matchedDxfPartId ?? "unknown"}`
    );
  }
  return parts.join(":");
}

export function documentRowToOccurrence(
  row: ExtractedDocumentRow,
  pdfItemIndex?: number
): RequestPartOccurrence {
  return {
    occurrenceId: buildOccurrenceId(row, pdfItemIndex),
    matchedDxfPartId: row.matchedDxfPartId,
    rawPartReference: row.rawPartReference,
    quantity: row.quantity,
    thicknessMm: row.thicknessMm,
    material: row.material,
    description: row.description,
    action: row.action,
    source: {
      documentId: row.documentId,
      type: row.source.type,
      fileName: row.source.fileName,
      sheetName: row.source.sheetName,
      rowNumber: row.source.rowNumber,
      pageNumber: row.source.pageNumber,
      excerpt: row.source.excerpt,
    },
    currentlyIgnored: false,
  };
}

/**
 * Build occurrences from extracted document rows.
 * Exact same documentId+location objects are collapsed with a debug warning.
 */
export function buildRequestOccurrences(documentRows: ExtractedDocumentRow[]): {
  occurrences: RequestPartOccurrence[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const occurrences: RequestPartOccurrence[] = [];
  const seenLocation = new Set<string>();
  const pdfItemCounters = new Map<string, number>();

  for (const row of documentRows) {
    let pdfItemIndex: number | undefined;
    if (row.source.type === "PDF" && row.source.rowNumber == null) {
      const n = (pdfItemCounters.get(row.documentId) ?? 0) + 1;
      pdfItemCounters.set(row.documentId, n);
      pdfItemIndex = n;
    }
    const occ = documentRowToOccurrence(row, pdfItemIndex);
    if (seenLocation.has(occ.occurrenceId)) {
      warnings.push(`DUPLICATE_EXTRACTION_OBJECT_REMOVED:${occ.occurrenceId}`);
      continue;
    }
    seenLocation.add(occ.occurrenceId);
    occurrences.push(occ);
  }

  return { occurrences, warnings };
}

export function canonicalKeyForOccurrence(
  occ: RequestPartOccurrence
): string | null {
  if (occ.matchedDxfPartId) return occ.matchedDxfPartId;
  if (occ.rawPartReference) {
    return normalizePartId(occ.rawPartReference)?.canonicalPartId ?? null;
  }
  return null;
}

export type PartOccurrenceClassification = {
  occurrences: RequestPartOccurrence[];
  occurrenceCount: number;
  duplicateOccurrenceCount: number;
  duplicateStatus: DuplicateOccurrenceStatus;
  duplicateIssues: string[];
  /** Primary occurrence kept for commercial resolution when identical duplicates. */
  primaryOccurrenceIds: Set<string>;
  ignoredOccurrences: RequestPartOccurrence[];
};

/**
 * Classify same-document duplicate request rows for one canonical part.
 * Cross-document agreement is NOT a duplicate (handled as CONSENSUS elsewhere).
 */
export function classifyPartOccurrences(
  occurrences: RequestPartOccurrence[]
): PartOccurrenceClassification {
  const docOccs = occurrences.filter(
    (o) => o.source.type === "XLSX" || o.source.type === "PDF"
  );

  if (docOccs.length <= 1) {
    return {
      occurrences: docOccs,
      occurrenceCount: docOccs.length,
      duplicateOccurrenceCount: 0,
      duplicateStatus: "NONE",
      duplicateIssues: [],
      primaryOccurrenceIds: new Set(docOccs.map((o) => o.occurrenceId)),
      ignoredOccurrences: [],
    };
  }

  // Group by documentId — duplicates are same-document only
  const byDoc = new Map<string, RequestPartOccurrence[]>();
  for (const o of docOccs) {
    const id = o.source.documentId ?? o.source.fileName ?? "unknown";
    const list = byDoc.get(id) ?? [];
    list.push(o);
    byDoc.set(id, list);
  }

  let identicalExtras = 0;
  let hasDifferentValues = false;
  const ignored: RequestPartOccurrence[] = [];
  const primaryIds = new Set<string>();

  for (const [, list] of byDoc) {
    if (list.length === 1) {
      primaryIds.add(list[0]!.occurrenceId);
      continue;
    }

    const keys = list.map(commercialKey);
    const allIdentical = keys.every((k) => k === keys[0]);
    if (allIdentical) {
      primaryIds.add(list[0]!.occurrenceId);
      for (let i = 1; i < list.length; i++) {
        identicalExtras += 1;
        ignored.push({ ...list[i]!, currentlyIgnored: true });
      }
      continue;
    }

    // Different commercial values in the same document
    hasDifferentValues = true;
    for (const o of list) primaryIds.add(o.occurrenceId);

    const qtys = list.map((o) => o.quantity);
    const qtyDiffer = qtys.some((q) => !valuesEqualNum(q, qtys[0] ?? null));
    if (!qtyDiffer) {
      // thickness/material differ but qty same — still repeated with different values
    }
  }

  if (hasDifferentValues) {
    return {
      occurrences: docOccs,
      occurrenceCount: docOccs.length,
      duplicateOccurrenceCount: 0,
      duplicateStatus: "REPEATED_WITH_DIFFERENT_VALUES",
      duplicateIssues: ["REPEATED_PART_DIFFERENT_QUANTITY"],
      primaryOccurrenceIds: primaryIds,
      ignoredOccurrences: [],
    };
  }

  if (identicalExtras > 0) {
    return {
      occurrences: docOccs.map((o) =>
        ignored.some((i) => i.occurrenceId === o.occurrenceId)
          ? { ...o, currentlyIgnored: true }
          : o
      ),
      occurrenceCount: docOccs.length,
      duplicateOccurrenceCount: identicalExtras,
      duplicateStatus: "IDENTICAL_DUPLICATE",
      duplicateIssues: ["IDENTICAL_REQUEST_ROW_DUPLICATE"],
      primaryOccurrenceIds: primaryIds,
      ignoredOccurrences: ignored,
    };
  }

  // Multiple docs, one row each (or mixed without same-doc dups) → not a duplicate
  return {
    occurrences: docOccs,
    occurrenceCount: docOccs.length,
    duplicateOccurrenceCount: 0,
    duplicateStatus: "NONE",
    duplicateIssues: [],
    primaryOccurrenceIds: new Set(docOccs.map((o) => o.occurrenceId)),
    ignoredOccurrences: [],
  };
}

function factLocationKey(fact: ExtractedRequestFact): string {
  return [
    fact.source.fileName ?? "",
    fact.source.sheetName ?? "",
    fact.source.rowNumber ?? "",
    fact.source.pageNumber ?? "",
  ].join("::");
}

function occurrenceLocationKey(o: RequestPartOccurrence): string {
  return [
    o.source.fileName ?? "",
    o.source.sheetName ?? "",
    o.source.rowNumber ?? "",
    o.source.pageNumber ?? "",
  ].join("::");
}

/**
 * For identical same-document duplicates, keep only primary-location document
 * VALUE facts so field resolution does not see phantom multi-row conflict/consensus.
 */
export function filterFactsForOccurrencePolicy(
  facts: ExtractedRequestFact[],
  classification: PartOccurrenceClassification
): ExtractedRequestFact[] {
  if (classification.duplicateStatus === "NONE") return facts;

  if (classification.duplicateStatus === "IDENTICAL_DUPLICATE") {
    const primaryLocs = new Set(
      classification.occurrences
        .filter((o) => classification.primaryOccurrenceIds.has(o.occurrenceId))
        .map(occurrenceLocationKey)
    );
    return facts.filter((f) => {
      if (f.source.type === "EMAIL") return true;
      if (f.instructionType !== "VALUE") return true;
      return primaryLocs.has(factLocationKey(f));
    });
  }

  // REPEATED_WITH_DIFFERENT_VALUES — keep all; quantity will conflict / be nulled
  return facts;
}

export function emptyOccurrenceFields(): Pick<
  FinalIntakeMappingRow,
  | "requestOccurrences"
  | "occurrenceCount"
  | "duplicateOccurrenceCount"
  | "duplicateStatus"
  | "ignoredOccurrences"
  | "duplicateIssues"
  | "displayLabel"
> {
  return {
    requestOccurrences: [],
    occurrenceCount: 0,
    duplicateOccurrenceCount: 0,
    duplicateStatus: "NONE",
    ignoredOccurrences: [],
    duplicateIssues: [],
    displayLabel: null,
  };
}

/**
 * Apply local prototype user resolution for identical duplicates.
 */
export function applyDuplicateUserResolution(
  row: FinalIntakeMappingRow,
  action: DuplicateUserAction
): FinalIntakeMappingRow[] {
  if (
    row.duplicateStatus !== "IDENTICAL_DUPLICATE" &&
    row.duplicateStatus !== "RESOLVED_IGNORE" &&
    row.duplicateStatus !== "RESOLVED_SUM" &&
    row.duplicateStatus !== "RESOLVED_KEEP_SEPARATE"
  ) {
    return [row];
  }

  const extras = row.requestOccurrences.filter((o) =>
    row.ignoredOccurrences.some((i) => i.occurrenceId === o.occurrenceId)
  );
  // If already resolved, recompute extras from non-primary
  const primary = row.requestOccurrences.find((o) => !o.currentlyIgnored);
  const secondary =
    extras.length > 0
      ? extras
      : row.requestOccurrences.filter(
          (o) => o.occurrenceId !== primary?.occurrenceId
        );

  if (action === "IGNORE") {
    const issues = row.issues.filter(
      (i) => i !== "IDENTICAL_REQUEST_ROW_DUPLICATE"
    );
    const qtyOk =
      typeof row.quantity === "number" &&
      Number.isFinite(row.quantity) &&
      row.quantity > 0;
    const thickOk =
      typeof row.thicknessMm === "number" &&
      Number.isFinite(row.thicknessMm) &&
      row.thicknessMm > 0;
    const matOk =
      typeof row.material === "string" && row.material.trim().length > 0;
    const otherBlocking =
      issues.some(
        (i) =>
          i.includes("CONFLICT") ||
          i.startsWith("MULTIPLE_") ||
          i.startsWith("MISSING_") ||
          i === "REPEATED_PART_DIFFERENT_QUANTITY"
      ) || hasBlockingGeometryIssue(issues);
    const terminalBlocked =
      row.status === "DXF_IDENTITY_CONFLICT" ||
      row.status === "DXF_REVISION_CONFLICT" ||
      row.status === "REQUEST_WITHOUT_DXF" ||
      row.status === "DXF_NOT_REQUESTED" ||
      row.status === "EXCLUDED";
    const canReady =
      Boolean(row.dxfFileId) &&
      qtyOk &&
      thickOk &&
      matOk &&
      !otherBlocking &&
      !terminalBlocked;

    return [
      {
        ...row,
        status: canReady ? "READY" : "NEEDS_REVIEW",
        duplicateStatus: "RESOLVED_IGNORE",
        duplicateIssues: [],
        ignoredOccurrences: secondary.map((o) => ({
          ...o,
          currentlyIgnored: true,
        })),
        issues,
        displayLabel: null,
      },
    ];
  }

  if (action === "SUM") {
    const qtys = row.requestOccurrences
      .map((o) => o.quantity)
      .filter((q): q is number => typeof q === "number" && Number.isFinite(q));
    const sum = qtys.reduce((a, b) => a + b, 0);
    const issues = row.issues.filter(
      (i) => i !== "IDENTICAL_REQUEST_ROW_DUPLICATE"
    );
    const canReady = !hasBlockingGeometryIssue(issues);
    return [
      {
        ...row,
        quantity: sum,
        fieldSources: {
          ...row.fieldSources,
          quantity: "USER_RESOLUTION",
        },
        fieldResolutions: {
          ...row.fieldResolutions,
          quantity: {
            value: sum,
            resolutionStatus: "USER_RESOLUTION",
            candidates: row.fieldResolutions.quantity.candidates,
          },
        },
        duplicateStatus: "RESOLVED_SUM",
        duplicateIssues: [],
        ignoredOccurrences: [],
        requestOccurrences: row.requestOccurrences.map((o) => ({
          ...o,
          currentlyIgnored: false,
        })),
        issues,
        status: canReady ? "READY" : "NEEDS_REVIEW",
        displayLabel: null,
      },
    ];
  }

  // KEEP_SEPARATE — primary + secondary display rows
  const primaryOcc =
    row.requestOccurrences.find((o) => !o.currentlyIgnored) ??
    row.requestOccurrences[0]!;
  const secondaryOccs = row.requestOccurrences.filter(
    (o) => o.occurrenceId !== primaryOcc.occurrenceId
  );

  const keepIssues = row.issues.filter(
    (i) => i !== "IDENTICAL_REQUEST_ROW_DUPLICATE"
  );
  const keepReady = !hasBlockingGeometryIssue(keepIssues);

  const primaryRow: FinalIntakeMappingRow = {
    ...row,
    duplicateStatus: "RESOLVED_KEEP_SEPARATE",
    duplicateIssues: [],
    ignoredOccurrences: [],
    requestOccurrences: [primaryOcc],
    occurrenceCount: 1,
    duplicateOccurrenceCount: 0,
    issues: keepIssues,
    status: keepReady ? "READY" : "NEEDS_REVIEW",
    quantity: primaryOcc.quantity,
    displayLabel: null,
  };

  const secondaryRows: FinalIntakeMappingRow[] = secondaryOccs.map(
    (occ, idx) => ({
      ...row,
      displayLabel: `${row.partId ?? "?"} — הופעה ${idx + 2}`,
      quantity: occ.quantity,
      thicknessMm: occ.thicknessMm,
      material: occ.material,
      description: occ.description,
      duplicateStatus: "RESOLVED_KEEP_SEPARATE",
      duplicateIssues: [],
      ignoredOccurrences: [],
      requestOccurrences: [occ],
      occurrenceCount: 1,
      duplicateOccurrenceCount: 0,
      issues: [],
      status: "READY",
      fieldSources: {
        quantity: occ.source.type === "XLSX" ? "XLSX" : "PDF",
        thickness: occ.source.type === "XLSX" ? "XLSX" : "PDF",
        material: occ.source.type === "XLSX" ? "XLSX" : "PDF",
      },
      fieldResolutions: {
        quantity: {
          value: occ.quantity,
          resolutionStatus: "SINGLE_SOURCE",
          candidates: row.fieldResolutions.quantity.candidates,
        },
        thickness: {
          value: occ.thicknessMm,
          resolutionStatus: "SINGLE_SOURCE",
          candidates: row.fieldResolutions.thickness.candidates,
        },
        material: {
          value: occ.material,
          resolutionStatus: "SINGLE_SOURCE",
          candidates: row.fieldResolutions.material.candidates,
        },
      },
    })
  );

  return [primaryRow, ...secondaryRows];
}
