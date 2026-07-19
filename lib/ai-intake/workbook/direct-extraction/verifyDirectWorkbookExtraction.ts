/**
 * Deterministic semantic verification for direct workbook extraction.
 * Evidence localization warnings do not reject grounded semantic rows.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { isUnitCompatibleWithTargetField } from "../interpreter/semanticFieldRegistry";
import { detectCandidatePartData } from "./detectCandidatePartData";
import type {
  DirectCoverageMetrics,
  DirectExtractedField,
  DirectExtractedMeasurement,
  DirectExtractedSourceRow,
  DirectExtractionVerification,
  DirectSourceReference,
  DirectVerificationCategory,
  DirectVerificationIssue,
  DirectVerificationSeverity,
  DirectWorkbookExtraction,
  SupportedUnit,
} from "./types";

function cellKey(sheet: string, address: string): string {
  return `${sheet}::${address.toUpperCase()}`;
}

function buildCellIndex(snapshot: WorkbookSnapshot) {
  const map = new Map<
    string,
    {
      sheetName: string;
      rowNumber: number;
      cellAddress: string;
      rawValue: unknown;
      formattedText: string;
    }
  >();
  for (const sheet of snapshot.sheets) {
    for (const c of sheet.cells) {
      map.set(cellKey(sheet.sheetName, c.cellAddress), {
        sheetName: sheet.sheetName,
        rowNumber: c.rowNumber,
        cellAddress: c.cellAddress,
        rawValue: c.rawValue,
        formattedText:
          c.formattedText != null && c.formattedText !== ""
            ? c.formattedText
            : c.rawValue == null
              ? ""
              : String(c.rawValue),
      });
    }
  }
  return map;
}

function nonEmptyRows(snapshot: WorkbookSnapshot): Array<{
  sheetName: string;
  rowNumber: number;
}> {
  const out: Array<{ sheetName: string; rowNumber: number }> = [];
  for (const sheet of snapshot.sheets) {
    const rows = new Set<number>();
    for (const c of sheet.cells) {
      const text =
        c.formattedText != null && c.formattedText !== ""
          ? c.formattedText
          : c.rawValue == null
            ? ""
            : String(c.rawValue);
      if (text.trim() !== "") rows.add(c.rowNumber);
    }
    for (const r of [...rows].sort((a, b) => a - b)) {
      out.push({ sheetName: sheet.sheetName, rowNumber: r });
    }
  }
  return out;
}

function issue(
  partial: Omit<DirectVerificationIssue, "severity" | "category"> & {
    severity?: DirectVerificationSeverity;
    category: DirectVerificationCategory;
  }
): DirectVerificationIssue {
  return {
    severity: partial.severity ?? "ERROR",
    category: partial.category,
    code: partial.code,
    workbookId: partial.workbookId,
    sheetName: partial.sheetName,
    sourceRowNumber: partial.sourceRowNumber,
    extractedRowId: partial.extractedRowId,
    field: partial.field,
    sourceReference: partial.sourceReference,
    expectedEvidence: partial.expectedEvidence,
    actualModelOutput: partial.actualModelOutput,
    message: partial.message,
  };
}

function valueGroundedInRefs(
  value: string | number,
  refs: DirectSourceReference[],
  cells: ReturnType<typeof buildCellIndex>
): boolean {
  const needle = String(value).toLowerCase().replace(/,/g, "");
  for (const ref of refs) {
    const cell = cells.get(cellKey(ref.sheetName, ref.cellAddress));
    const hay = (
      ref.quotedSourceText ??
      cell?.formattedText ??
      (ref.rawValue == null ? "" : String(ref.rawValue))
    )
      .toLowerCase()
      .replace(/,/g, "");
    if (hay.includes(needle)) return true;
    const num = Number.parseFloat(needle);
    if (Number.isFinite(num)) {
      const found = hay.match(/-?\d+(?:\.\d+)?/g) ?? [];
      if (found.some((f) => Math.abs(Number.parseFloat(f) - num) < 1e-9)) {
        return true;
      }
    }
    // Local evidence already verified
    if (
      ref.evidenceStatus &&
      ref.evidenceStatus !== "NOT_FOUND" &&
      (ref.evidenceStatus === "EXACT" ||
        ref.evidenceStatus === "NORMALIZED_EXACT" ||
        ref.evidenceStatus === "UNIQUE_VALUE_MATCH" ||
        ref.evidenceStatus === "DERIVED_VERIFIED" ||
        ref.evidenceStatus === "MULTIPLE_MATCHES")
    ) {
      return true;
    }
  }
  return false;
}

function verifySourceRef(args: {
  ref: DirectSourceReference;
  cells: ReturnType<typeof buildCellIndex>;
  workbookId: string;
  extractedRowId: string | null;
  field: string;
}): DirectVerificationIssue[] {
  const out: DirectVerificationIssue[] = [];
  const cell = args.cells.get(cellKey(args.ref.sheetName, args.ref.cellAddress));
  if (!cell) {
    out.push(
      issue({
        category: "SOURCE_REFERENCE",
        code: "INVALID_CELL_REFERENCE",
        workbookId: args.workbookId,
        sheetName: args.ref.sheetName,
        sourceRowNumber: args.ref.rowNumber,
        extractedRowId: args.extractedRowId,
        field: args.field,
        sourceReference: args.ref,
        expectedEvidence: `cell ${args.ref.cellAddress}`,
        actualModelOutput: null,
        message: `Source cell ${args.ref.sheetName}!${args.ref.cellAddress} does not exist`,
      })
    );
    return out;
  }

  // Missing unique offset with valid cell → WARNING (evidence localization)
  if (
    args.ref.characterStart == null ||
    args.ref.characterEnd == null
  ) {
    if (args.ref.evidenceStatus === "MULTIPLE_MATCHES") {
      out.push(
        issue({
          category: "EVIDENCE_LOCALIZATION",
          severity: "WARNING",
          code: "MULTIPLE_MATCHING_SPANS",
          workbookId: args.workbookId,
          sheetName: args.ref.sheetName,
          sourceRowNumber: args.ref.rowNumber,
          extractedRowId: args.extractedRowId,
          field: args.field,
          sourceReference: args.ref,
          expectedEvidence: "unique character span",
          actualModelOutput: null,
          message: "Multiple matching spans in valid cell",
        })
      );
    } else if (args.ref.evidenceStatus !== "NOT_FOUND") {
      out.push(
        issue({
          category: "EVIDENCE_LOCALIZATION",
          severity: "INFO",
          code: "MISSING_UNIQUE_OFFSET",
          workbookId: args.workbookId,
          sheetName: args.ref.sheetName,
          sourceRowNumber: args.ref.rowNumber,
          extractedRowId: args.extractedRowId,
          field: args.field,
          sourceReference: args.ref,
          expectedEvidence: "optional unique offset",
          actualModelOutput: null,
          message: "No unique character offset; cell-level evidence is valid",
        })
      );
    }
  } else if (
    args.ref.quotedSourceText != null &&
    args.ref.characterStart != null &&
    args.ref.characterEnd != null
  ) {
    const full = cell.formattedText;
    if (
      args.ref.characterStart < 0 ||
      args.ref.characterEnd > full.length ||
      args.ref.characterStart > args.ref.characterEnd
    ) {
      out.push(
        issue({
          category: "EVIDENCE_LOCALIZATION",
          severity: "WARNING",
          code: "INVALID_CHARACTER_SPAN",
          workbookId: args.workbookId,
          sheetName: args.ref.sheetName,
          sourceRowNumber: args.ref.rowNumber,
          extractedRowId: args.extractedRowId,
          field: args.field,
          sourceReference: args.ref,
          expectedEvidence: full,
          actualModelOutput: args.ref.quotedSourceText,
          message: "Character span outside source text (local)",
        })
      );
    } else {
      const slice = full.slice(args.ref.characterStart, args.ref.characterEnd);
      if (slice !== args.ref.quotedSourceText) {
        out.push(
          issue({
            category: "EVIDENCE_LOCALIZATION",
            severity: "WARNING",
            code: "QUOTED_TEXT_MISMATCH",
            workbookId: args.workbookId,
            sheetName: args.ref.sheetName,
            sourceRowNumber: args.ref.rowNumber,
            extractedRowId: args.extractedRowId,
            field: args.field,
            sourceReference: args.ref,
            expectedEvidence: slice,
            actualModelOutput: args.ref.quotedSourceText,
            message: "Quoted source text does not match local span",
          })
        );
      }
    }
  }
  return out;
}

function verifyField(args: {
  fieldName: string;
  field: DirectExtractedField | null;
  row: DirectExtractedSourceRow;
  cells: ReturnType<typeof buildCellIndex>;
  workbookId: string;
}): DirectVerificationIssue[] {
  if (!args.field) return [];
  const out: DirectVerificationIssue[] = [];
  if (args.field.sourceRefs.length === 0) {
    out.push(
      issue({
        category: "SOURCE_REFERENCE",
        code: "MISSING_SOURCE_REFS",
        workbookId: args.workbookId,
        sheetName: args.row.sheetName,
        sourceRowNumber: args.row.sourceRowNumbers[0] ?? null,
        extractedRowId: args.row.extractedRowId,
        field: args.fieldName,
        sourceReference: null,
        expectedEvidence: ">=1 sourceRef",
        actualModelOutput: String(args.field.value),
        message: `Field ${args.fieldName} has no source references`,
      })
    );
    return out;
  }
  for (const ref of args.field.sourceRefs) {
    out.push(
      ...verifySourceRef({
        ref,
        cells: args.cells,
        workbookId: args.workbookId,
        extractedRowId: args.row.extractedRowId,
        field: args.fieldName,
      })
    );
  }
  if (
    args.field.interpretation === "EXPLICIT" &&
    !valueGroundedInRefs(args.field.value, args.field.sourceRefs, args.cells)
  ) {
    out.push(
      issue({
        category: "SEMANTIC",
        code: "VALUE_NOT_GROUNDED",
        workbookId: args.workbookId,
        sheetName: args.row.sheetName,
        sourceRowNumber: args.row.sourceRowNumbers[0] ?? null,
        extractedRowId: args.row.extractedRowId,
        field: args.fieldName,
        sourceReference: args.field.sourceRefs[0] ?? null,
        expectedEvidence: "value present in source refs",
        actualModelOutput: String(args.field.value),
        message: `Field ${args.fieldName} value is not grounded in its source evidence`,
      })
    );
  }
  return out;
}

function verifyMeasurement(args: {
  fieldName: string;
  field: DirectExtractedMeasurement | null;
  row: DirectExtractedSourceRow;
  cells: ReturnType<typeof buildCellIndex>;
  workbookId: string;
  targetField:
    | "THICKNESS"
    | "WIDTH"
    | "LENGTH"
    | "AREA"
    | "UNIT_WEIGHT"
    | "TOTAL_WEIGHT";
}): DirectVerificationIssue[] {
  if (!args.field) return [];
  const out: DirectVerificationIssue[] = [];
  if (!Number.isFinite(args.field.rawValue)) {
    out.push(
      issue({
        category: "TYPE",
        code: "INVALID_MEASUREMENT",
        workbookId: args.workbookId,
        sheetName: args.row.sheetName,
        sourceRowNumber: args.row.sourceRowNumbers[0] ?? null,
        extractedRowId: args.row.extractedRowId,
        field: args.fieldName,
        sourceReference: null,
        expectedEvidence: "finite number",
        actualModelOutput: String(args.field.rawValue),
        message: "Measurement is not finite",
      })
    );
  }
  if (
    args.field.rawUnit &&
    !isUnitCompatibleWithTargetField(
      args.field.rawUnit as SupportedUnit,
      args.targetField
    )
  ) {
    out.push(
      issue({
        category: "UNIT",
        code: "INCOMPATIBLE_UNIT",
        workbookId: args.workbookId,
        sheetName: args.row.sheetName,
        sourceRowNumber: args.row.sourceRowNumbers[0] ?? null,
        extractedRowId: args.row.extractedRowId,
        field: args.fieldName,
        sourceReference: args.field.sourceRefs[0] ?? null,
        expectedEvidence: `unit compatible with ${args.targetField}`,
        actualModelOutput: args.field.rawUnit,
        message: "Unit is incompatible with target field dimension",
      })
    );
  }
  out.push(
    ...verifyField({
      fieldName: args.fieldName,
      field: {
        value: args.field.rawValue,
        confidence: args.field.confidence,
        interpretation: args.field.interpretation,
        sourceRefs: args.field.sourceRefs,
        reason: args.field.reason,
      },
      row: args.row,
      cells: args.cells,
      workbookId: args.workbookId,
    })
  );
  return out;
}

const LEAKAGE_CLASS = new Set([
  "TOTAL",
  "SUBTOTAL",
  "HEADER",
  "REPEATED_HEADER",
  "FOOTER",
  "NOTE",
]);

function buildCoverageMetrics(args: {
  meaningful: number;
  classified: number;
  unprocessed: number;
  candidatePartRows: number;
  extractedPartRows: number;
  verifiedPartRows: number;
}): DirectCoverageMetrics {
  const pct = (n: number, d: number) =>
    d === 0 ? 100 : Math.round((n / d) * 100);
  return {
    meaningfulRows: args.meaningful,
    classifiedRows: args.classified,
    candidatePartRows: args.candidatePartRows,
    extractedPartRows: args.extractedPartRows,
    verifiedPartRows: args.verifiedPartRows,
    unprocessedRows: args.unprocessed,
    unresolvedCandidatePartRows: Math.max(
      0,
      args.candidatePartRows - args.verifiedPartRows
    ),
    classificationCoveragePercentage: pct(
      args.meaningful - args.unprocessed,
      args.meaningful
    ),
    partExtractionCoveragePercentage: pct(
      args.extractedPartRows,
      Math.max(1, args.candidatePartRows)
    ),
    verifiedPartCoveragePercentage: pct(
      args.verifiedPartRows,
      Math.max(1, args.candidatePartRows)
    ),
  };
}

export function verifyDirectWorkbookExtraction(args: {
  snapshot: WorkbookSnapshot;
  extraction: DirectWorkbookExtraction;
}): DirectExtractionVerification {
  const errors: DirectVerificationIssue[] = [];
  const warnings: DirectVerificationIssue[] = [];
  const infos: DirectVerificationIssue[] = [];
  const rejectedFieldKeys: string[] = [];
  const workbookId = args.snapshot.documentId;
  const cells = buildCellIndex(args.snapshot);
  const meaningful = nonEmptyRows(args.snapshot);

  const candidate = detectCandidatePartData({
    snapshot: args.snapshot,
    extraction: args.extraction,
  });

  const pushIssue = (i: DirectVerificationIssue) => {
    if (i.severity === "ERROR") errors.push(i);
    else if (i.severity === "WARNING") warnings.push(i);
    else infos.push(i);
  };

  if (args.extraction.workbookId !== workbookId) {
    pushIssue(
      issue({
        category: "STRUCTURAL",
        code: "WORKBOOK_ID_MISMATCH",
        workbookId,
        sheetName: null,
        sourceRowNumber: null,
        extractedRowId: null,
        field: null,
        sourceReference: null,
        expectedEvidence: workbookId,
        actualModelOutput: args.extraction.workbookId,
        message: "Extraction workbookId does not match snapshot",
      })
    );
  }

  if (
    args.extraction.status === "MAPPING_REQUIRED" ||
    args.extraction.status === "UNSUPPORTED"
  ) {
    const coverageMetrics = buildCoverageMetrics({
      meaningful: meaningful.length,
      classified: args.extraction.sourceRowLedger.length,
      unprocessed: meaningful.length,
      candidatePartRows: candidate.candidatePartRowEstimate,
      extractedPartRows: 0,
      verifiedPartRows: 0,
    });
    return {
      status: "MAPPING_REQUIRED",
      score: 0,
      verifiedRowCount: 0,
      rejectedRowCount: 0,
      coverage: {
        meaningfulRows: meaningful.length,
        classifiedRows: args.extraction.sourceRowLedger.length,
        unprocessedRows: meaningful.length,
        coveragePercentage: 0,
      },
      coverageMetrics,
      errors,
      warnings,
      infos,
      rejectedFieldKeys,
      correctionFeedback: {
        summary: "Model requested mapping / unsupported",
        issues: errors,
        aggregated: [],
      },
      hasCandidatePartData: candidate.hasCandidatePartData,
    };
  }

  // Ambiguous-all without alternatives → MAPPING_REQUIRED signal
  const ambiguousEntries = args.extraction.sourceRowLedger.filter(
    (e) => e.classification === "AMBIGUOUS"
  );
  const ambiguousWithoutReasons = ambiguousEntries.filter(
    (e) =>
      !e.ambiguityType &&
      (!e.competingInterpretations || e.competingInterpretations.length === 0) &&
      !e.reason.trim()
  );
  if (
    args.extraction.rows.length === 0 &&
    ambiguousEntries.length > 0 &&
    ambiguousEntries.length === args.extraction.sourceRowLedger.filter(
      (e) =>
        e.classification === "PART" ||
        e.classification === "AMBIGUOUS" ||
        e.classification === "UNPROCESSED"
    ).length
  ) {
    pushIssue(
      issue({
        category: "SEMANTIC",
        code: "AMBIGUOUS_ALL_ROWS",
        workbookId,
        sheetName: null,
        sourceRowNumber: null,
        extractedRowId: null,
        field: null,
        sourceReference: null,
        expectedEvidence: "row-specific ambiguity alternatives or PART rows",
        actualModelOutput: String(ambiguousEntries.length),
        message:
          "All candidate rows marked AMBIGUOUS without structured alternatives",
      })
    );
  }
  for (const e of ambiguousWithoutReasons) {
    pushIssue(
      issue({
        category: "SEMANTIC",
        severity: "WARNING",
        code: "AMBIGUOUS_WITHOUT_ALTERNATIVES",
        workbookId,
        sheetName: e.sheetName,
        sourceRowNumber: e.rowNumber,
        extractedRowId: null,
        field: null,
        sourceReference: null,
        expectedEvidence: "ambiguityType + competingInterpretations",
        actualModelOutput: e.classification,
        message: "AMBIGUOUS row lacks structured alternatives",
      })
    );
  }

  const ledgerKeys = new Set(
    args.extraction.sourceRowLedger.map(
      (e) => `${e.sheetName}::${e.rowNumber}`
    )
  );

  let unprocessed = 0;
  for (const r of meaningful) {
    const key = `${r.sheetName}::${r.rowNumber}`;
    if (!ledgerKeys.has(key)) {
      unprocessed += 1;
      pushIssue(
        issue({
          category: "COVERAGE",
          code: "MISSING_LEDGER_ENTRY",
          workbookId,
          sheetName: r.sheetName,
          sourceRowNumber: r.rowNumber,
          extractedRowId: null,
          field: null,
          sourceReference: null,
          expectedEvidence: "ledger classification",
          actualModelOutput: null,
          message: "Meaningful source row missing from ledger",
        })
      );
    }
  }

  for (const entry of args.extraction.sourceRowLedger) {
    if (
      LEAKAGE_CLASS.has(entry.classification) &&
      entry.extractedRowIds.length > 0
    ) {
      pushIssue(
        issue({
          category: "SEMANTIC",
          code: "TOTAL_FOOTER_LEAKAGE",
          workbookId,
          sheetName: entry.sheetName,
          sourceRowNumber: entry.rowNumber,
          extractedRowId: entry.extractedRowIds[0] ?? null,
          field: null,
          sourceReference: null,
          expectedEvidence: "no PART extraction",
          actualModelOutput: entry.extractedRowIds.join(","),
          message: `${entry.classification} row must not produce part rows`,
        })
      );
    }
  }

  const partRowIds = new Map<string, number>();
  let verifiedRows = 0;
  let rejectedRows = 0;

  for (const row of args.extraction.rows) {
    if (row.rowRole !== "PART") {
      pushIssue(
        issue({
          category: "STRUCTURAL",
          code: "INVALID_ROW_ROLE",
          workbookId,
          sheetName: row.sheetName,
          sourceRowNumber: row.sourceRowNumbers[0] ?? null,
          extractedRowId: row.extractedRowId,
          field: null,
          sourceReference: null,
          expectedEvidence: "PART",
          actualModelOutput: String(row.rowRole),
          message: "Extracted row role must be PART",
        })
      );
      rejectedRows += 1;
      continue;
    }

    const rowErrorsBefore = errors.length;
    const fieldIssues = [
      ...verifyField({
        fieldName: "explicitPartIdentifier",
        field: row.explicitPartIdentifier,
        row,
        cells,
        workbookId,
      }),
      ...verifyField({
        fieldName: "sourceDescriptor",
        field: row.sourceDescriptor,
        row,
        cells,
        workbookId,
      }),
      ...verifyField({
        fieldName: "profile",
        field: row.profile,
        row,
        cells,
        workbookId,
      }),
      ...verifyField({
        fieldName: "quantity",
        field: row.quantity,
        row,
        cells,
        workbookId,
      }),
      ...verifyField({
        fieldName: "material",
        field: row.material,
        row,
        cells,
        workbookId,
      }),
      ...verifyMeasurement({
        fieldName: "thickness",
        field: row.thickness,
        row,
        cells,
        workbookId,
        targetField: "THICKNESS",
      }),
      ...verifyMeasurement({
        fieldName: "width",
        field: row.width,
        row,
        cells,
        workbookId,
        targetField: "WIDTH",
      }),
      ...verifyMeasurement({
        fieldName: "length",
        field: row.length,
        row,
        cells,
        workbookId,
        targetField: "LENGTH",
      }),
      ...verifyMeasurement({
        fieldName: "area",
        field: row.area,
        row,
        cells,
        workbookId,
        targetField: "AREA",
      }),
      ...verifyMeasurement({
        fieldName: "unitWeight",
        field: row.unitWeight,
        row,
        cells,
        workbookId,
        targetField: "UNIT_WEIGHT",
      }),
      ...verifyMeasurement({
        fieldName: "totalWeight",
        field: row.totalWeight,
        row,
        cells,
        workbookId,
        targetField: "TOTAL_WEIGHT",
      }),
    ];

    for (const fi of fieldIssues) {
      pushIssue(fi);
      if (
        fi.severity === "ERROR" &&
        (fi.category === "SEMANTIC" ||
          fi.category === "SOURCE_REFERENCE" ||
          fi.category === "TYPE" ||
          fi.category === "UNIT") &&
        fi.field
      ) {
        rejectedFieldKeys.push(`${row.extractedRowId}:${fi.field}`);
      }
    }

    if (
      row.quantity &&
      typeof row.quantity.value === "number" &&
      row.quantity.value <= 0
    ) {
      pushIssue(
        issue({
          category: "SEMANTIC",
          code: "INVALID_QUANTITY",
          workbookId,
          sheetName: row.sheetName,
          sourceRowNumber: row.sourceRowNumbers[0] ?? null,
          extractedRowId: row.extractedRowId,
          field: "quantity",
          sourceReference: row.quantity.sourceRefs[0] ?? null,
          expectedEvidence: "> 0",
          actualModelOutput: String(row.quantity.value),
          message: "Quantity must be positive",
        })
      );
      rejectedFieldKeys.push(`${row.extractedRowId}:quantity`);
    }

    if (
      row.explicitPartIdentifier &&
      row.profile &&
      String(row.explicitPartIdentifier.value).trim() ===
        String(row.profile.value).trim() &&
      row.explicitPartIdentifier.interpretation === "EXPLICIT"
    ) {
      // Soft: profile promoted to identifier — semantic warning
      pushIssue(
        issue({
          category: "SEMANTIC",
          severity: "WARNING",
          code: "PROFILE_AS_IDENTIFIER",
          workbookId,
          sheetName: row.sheetName,
          sourceRowNumber: row.sourceRowNumbers[0] ?? null,
          extractedRowId: row.extractedRowId,
          field: "explicitPartIdentifier",
          sourceReference: row.explicitPartIdentifier.sourceRefs[0] ?? null,
          expectedEvidence: "distinct identifier evidence",
          actualModelOutput: String(row.explicitPartIdentifier.value),
          message: "Profile text equals explicit identifier",
        })
      );
    }

    const key = `${row.sheetName}::${row.sourceRowNumbers.join(",")}`;
    partRowIds.set(key, (partRowIds.get(key) ?? 0) + 1);

    const newSemanticErrors = errors
      .slice(rowErrorsBefore)
      .filter(
        (e) =>
          e.category === "SEMANTIC" ||
          e.category === "SOURCE_REFERENCE" ||
          e.category === "STRUCTURAL"
      );
    if (newSemanticErrors.length === 0) verifiedRows += 1;
    else rejectedRows += 1;
  }

  for (const [key, count] of partRowIds) {
    if (count > 1) {
      pushIssue(
        issue({
          category: "STRUCTURAL",
          severity: "WARNING",
          code: "DUPLICATE_OUTPUT_ROW",
          workbookId,
          sheetName: key.split("::")[0] ?? null,
          sourceRowNumber: null,
          extractedRowId: null,
          field: null,
          sourceReference: null,
          expectedEvidence: "single extraction or documented split",
          actualModelOutput: String(count),
          message: `Source key ${key} produced ${count} part rows`,
        })
      );
    }
  }

  const coverageMetrics = buildCoverageMetrics({
    meaningful: meaningful.length,
    classified: args.extraction.sourceRowLedger.length,
    unprocessed,
    candidatePartRows: Math.max(
      candidate.candidatePartRowEstimate,
      args.extraction.sourceRowLedger.filter((e) => e.classification === "PART")
        .length,
      args.extraction.rows.length
    ),
    extractedPartRows: args.extraction.rows.length,
    verifiedPartRows: verifiedRows,
  });

  const hardErrors = errors.filter((e) => e.severity === "ERROR");
  const semanticOrStructural = hardErrors.filter((e) =>
    ["SEMANTIC", "STRUCTURAL", "COVERAGE", "SOURCE_REFERENCE"].includes(
      e.category
    )
  );

  let status: DirectExtractionVerification["status"] = "PASS";

  // Fail-closed: zero verified with candidate data
  if (candidate.hasCandidatePartData && verifiedRows === 0) {
    status =
      hardErrors.some((e) => e.code === "AMBIGUOUS_ALL_ROWS")
        ? "MAPPING_REQUIRED"
        : "CORRECTION_REQUIRED";
    if (!hardErrors.some((e) => e.code === "ZERO_VERIFIED_WITH_CANDIDATES")) {
      pushIssue(
        issue({
          category: "COVERAGE",
          code: "ZERO_VERIFIED_WITH_CANDIDATES",
          workbookId,
          sheetName: null,
          sourceRowNumber: null,
          extractedRowId: null,
          field: null,
          sourceReference: null,
          expectedEvidence: ">0 verified part rows",
          actualModelOutput: "0",
          message:
            "Zero verified part rows while candidate part data exists — cannot PASS",
        })
      );
    }
  } else if (semanticOrStructural.length > 0) {
    status = "CORRECTION_REQUIRED";
  } else if (warnings.length > 0 || infos.length > 0) {
    status = "PASS_WITH_WARNINGS";
  }

  // Classification-only is not success when no verified parts and candidates exist
  if (
    coverageMetrics.classificationCoveragePercentage === 100 &&
    verifiedRows === 0 &&
    candidate.hasCandidatePartData &&
    status === "PASS"
  ) {
    status = "CORRECTION_REQUIRED";
  }

  const score = Math.max(
    0,
    Math.min(
      1,
      coverageMetrics.verifiedPartCoveragePercentage / 100 -
        hardErrors.length * 0.05 -
        rejectedRows * 0.02
    )
  );

  const aggMap = new Map<
    string,
    { issueCode: string; affectedFieldCount: number; category: DirectVerificationIssue["category"] }
  >();
  for (const e of [...hardErrors, ...warnings]) {
    const k = `${e.category}::${e.code}`;
    const cur = aggMap.get(k) ?? {
      issueCode: e.code,
      affectedFieldCount: 0,
      category: e.category,
    };
    cur.affectedFieldCount += 1;
    aggMap.set(k, cur);
  }

  return {
    status,
    score,
    verifiedRowCount: verifiedRows,
    rejectedRowCount: rejectedRows,
    coverage: {
      meaningfulRows: meaningful.length,
      classifiedRows: args.extraction.sourceRowLedger.length,
      unprocessedRows: unprocessed,
      coveragePercentage: coverageMetrics.classificationCoveragePercentage,
    },
    coverageMetrics,
    errors,
    warnings,
    infos,
    rejectedFieldKeys,
    correctionFeedback: {
      summary: `${hardErrors.length} errors, ${warnings.length} warnings, verifiedParts=${verifiedRows}, classCoverage=${coverageMetrics.classificationCoveragePercentage}%, partCoverage=${coverageMetrics.verifiedPartCoveragePercentage}%`,
      issues: [...hardErrors, ...warnings].slice(0, 80),
      aggregated: [...aggMap.values()].map((a) => ({
        ...a,
        action:
          a.category === "EVIDENCE_LOCALIZATION"
            ? "No AI correction required; repaired locally"
            : "Eligible for correction when unresolved",
      })),
    },
    hasCandidatePartData: candidate.hasCandidatePartData,
  };
}
