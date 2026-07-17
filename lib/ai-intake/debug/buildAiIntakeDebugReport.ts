import { buildOccurrenceId } from "../requestOccurrences";
import { GEOMETRY_BLOCKING_ISSUES } from "../compareDocumentDxfGeometry";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  ExtractedRequestFact,
  FinalIntakeMappingRow,
} from "../schemas";
import { serializeAiIntakeDebugReport } from "./serializeAiIntakeDebugReport";
import {
  AI_INTAKE_DEBUG_REPORT_SCHEMA_VERSION,
  type AiIntakeDebugReportContext,
  type AiIntakeDebugReportV1,
  type DebugDiagnosticIssue,
  type DebugDocumentReport,
  type DebugFactItem,
  type DebugMatchingRow,
  type DebugOutputPart,
  type DebugReconciliationPart,
  type DebugTokenUsage,
} from "./types";

function usageOrNull(u: {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
} | null | undefined): DebugTokenUsage {
  if (!u) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  return {
    inputTokens: u.inputTokens ?? null,
    outputTokens: u.outputTokens ?? null,
    totalTokens: u.totalTokens ?? null,
  };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function classifyIssueSeverity(
  code: string
): "BLOCKING" | "WARNING" | "INFO" {
  if (
    (GEOMETRY_BLOCKING_ISSUES as readonly string[]).includes(code) ||
    code.includes("BLOCKING") ||
    code.includes("CONFLICT") ||
    code.includes("MISMATCH") ||
    code.startsWith("HIDDEN_PART")
  ) {
    return "BLOCKING";
  }
  if (
    code.includes("AMBIGUOUS") ||
    code.includes("WARNING") ||
    code.includes("INCOMPLETE") ||
    code.includes("INCONSISTENT") ||
    code.includes("REQUIRES_REVIEW")
  ) {
    return "WARNING";
  }
  if (code.startsWith("INFO_") || code.includes("INFO")) {
    return "INFO";
  }
  return "WARNING";
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function workbookCellsFromSnapshot(snapshot: unknown): unknown {
  const snap = asRecord(snapshot);
  if (!snap) return null;
  const sheets = asArray(snap.sheets);
  return {
    documentId: snap.documentId ?? null,
    fileName: snap.fileName ?? null,
    parserKind: snap.parserKind ?? null,
    warnings: snap.warnings ?? [],
    sheets: sheets.map((s) => {
      const sheet = asRecord(s) ?? {};
      return {
        sheetName: sheet.sheetName ?? null,
        usedRange: sheet.usedRange ?? null,
        mergedRanges: sheet.mergedRanges ?? [],
        hidden: sheet.hidden ?? null,
        cells: asArray(sheet.cells),
      };
    }),
  };
}

function buildDocumentReport(
  doc: AiIntakeAnalyzeSuccess["aggregated"]["documents"][number]
): DebugDocumentReport {
  const ev = doc.workbookEvidence ?? null;
  const isPdf = doc.sourceType === "PDF";
  const reconstructed = asArray(ev?.rawPartRows);
  const normalized = asArray(ev?.normalizedMeasurements);
  const profiles = asArray(ev?.columnUnitProfiles);
  const precision = asArray(ev?.precisionComparisons);
  const tableUnitInference = asArray(ev?.tableUnitInference);

  let pageEvidence: unknown = null;
  let originHint: string | null = null;
  if (isPdf) {
    originHint = "AI_EXTRACTED_PDF";
    pageEvidence = {
      pages: doc.rows.map((r) => ({
        pageNumber: r.source.pageNumber,
        excerpt: r.source.excerpt,
        rawPartReference: r.rawPartReference,
        quantity: r.quantity,
        thicknessMm: r.thicknessMm,
        material: r.material,
        documentGeometry: r.documentGeometry,
        issues: r.issues,
      })),
    };
  }

  return {
    documentId: doc.documentId,
    sourceType: doc.sourceType,
    fileName: doc.fileName,
    status: doc.status,
    errorCode: doc.errorCode,
    parserKind: ev?.parserKind ?? null,
    durationMs: doc.durationMs ?? null,
    usage: usageOrNull(doc.usage),
    validationMessages: [...doc.warnings],
    coverage: ev?.coverage ?? null,
    mapping: ev?.mapping ?? null,
    sourceEvidence: ev ? workbookCellsFromSnapshot(ev.snapshot) : pageEvidence,
    reconstructedRows: reconstructed,
    normalizedMeasurements: normalized,
    columnUnitProfiles: profiles,
    precisionComparisons: precision,
    extractedRows: doc.rows.map((r) => ({ ...r })),
    tableUnitInference,
    pageEvidence: isPdf ? pageEvidence : null,
    originHint,
  };
}

function buildMatching(
  result: AiIntakeAnalyzeSuccess
): AiIntakeDebugReportV1["matching"] {
  const rows: DebugMatchingRow[] = [];
  const docRows = result.extraction.documentRows;
  const pdfIndexByDoc = new Map<string, number>();

  for (const row of docRows) {
    let pdfIdx: number | undefined;
    if (row.source.type === "PDF") {
      const n = pdfIndexByDoc.get(row.documentId) ?? 0;
      pdfIndexByDoc.set(row.documentId, n + 1);
      pdfIdx = n;
    }
    const occurrenceId = buildOccurrenceId(row, pdfIdx);
    const audit = findAuditForDocumentRow(result, row);
    rows.push({
      occurrenceId,
      status: audit?.status ?? (row.matchedDxfPartId ? "MATCHED" : "REQUEST_PART_NOT_IN_DXF"),
      rawPartReference: row.rawPartReference,
      matchedDxfPartId: row.matchedDxfPartId,
      sourceType: row.source.type,
      sourceLabel: audit?.sourceLabel ?? null,
      documentId: row.documentId,
      extractedQuantity: row.quantity,
      extractedThicknessMm: row.thicknessMm,
      extractedMaterial: row.material,
      reason: audit?.reason ?? null,
      hasDocumentAndEmail: audit?.hasDocumentAndEmail ?? null,
    });
  }

  // Preserve DXF-only / email-only audit rows that are not document occurrences.
  for (const a of result.auditRows) {
    if (a.sourceType === "XLSX" || a.sourceType === "PDF") continue;
    rows.push({
      occurrenceId: null,
      status: a.status,
      rawPartReference: a.rawPartReference,
      matchedDxfPartId: a.matchedDxfPartId,
      sourceType: a.sourceType,
      sourceLabel: a.sourceLabel,
      documentId: a.documentId ?? null,
      extractedQuantity: a.extractedQuantity,
      extractedThicknessMm: a.extractedThicknessMm,
      extractedMaterial: a.extractedMaterial,
      reason: a.reason,
      hasDocumentAndEmail: a.hasDocumentAndEmail ?? null,
    });
  }

  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  for (const r of rows) {
    if (r.status === "MATCHED") matched += 1;
    else if (r.status === "MAPPING_REQUIRES_REVIEW") ambiguous += 1;
    else unmatched += 1;
  }

  return {
    rows,
    counts: {
      matched,
      unmatched,
      ambiguous,
      total: rows.length,
    },
  };
}

function findAuditForDocumentRow(
  result: AiIntakeAnalyzeSuccess,
  row: ExtractedDocumentRow
) {
  return (
    result.auditRows.find(
      (a) =>
        a.documentId === row.documentId &&
        a.rawPartReference === row.rawPartReference &&
        (a.sourceType === row.source.type || a.sourceType == null) &&
        (a.sourceLabel?.includes(`row ${row.source.rowNumber}`) ||
          a.sourceLabel?.includes(`page ${row.source.pageNumber}`) ||
          row.source.rowNumber == null)
    ) ??
    result.auditRows.find(
      (a) =>
        a.documentId === row.documentId &&
        a.rawPartReference === row.rawPartReference &&
        a.sourceType === row.source.type
    ) ??
    null
  );
}

function factToDebugItem(fact: ExtractedRequestFact): DebugFactItem {
  return {
    factId: fact.emailFactId ?? null,
    occurrenceId: null,
    matchedDxfPartId: fact.matchedDxfPartId,
    rawPartReference: fact.rawPartReference,
    field: fact.field,
    value: fact.value as string | number | boolean | null,
    unit: null,
    instructionType: fact.instructionType,
    explicitlySupersedesPrevious: fact.explicitlySupersedesPrevious ?? null,
    statementIndex: fact.statementIndex ?? null,
    source: {
      type: fact.source.type,
      fileName: fact.source.fileName,
      sheetName: fact.source.sheetName,
      rowNumber: fact.source.rowNumber,
      pageNumber: fact.source.pageNumber,
      cellReferences: [...fact.source.cellReferences],
      excerpt: fact.source.excerpt,
    },
    issues: [...fact.issues],
  };
}

function buildFacts(
  result: AiIntakeAnalyzeSuccess
): AiIntakeDebugReportV1["facts"] {
  const items = result.acceptedFacts.map(factToDebugItem);
  const countsByField: Record<string, number> = {};
  const countsBySourceType: Record<string, number> = {};
  for (const f of items) {
    bump(countsByField, f.field);
    bump(countsBySourceType, f.source.type);
  }
  return { items, countsByField, countsBySourceType };
}

function buildReconciliation(
  finalRows: FinalIntakeMappingRow[]
): AiIntakeDebugReportV1["reconciliation"] {
  const parts: DebugReconciliationPart[] = finalRows.map((r) => ({
    partId: r.partId,
    status: r.status,
    quantity: r.quantity,
    thicknessMm: r.thicknessMm,
    material: r.material,
    fieldSources: r.fieldSources,
    fieldCandidates: r.fieldCandidates,
    fieldResolutions: r.fieldResolutions,
    previousValues: r.previousValues,
    contributingFacts: r.contributingFacts.map((f) => ({
      field: f.field,
      value: f.value as string | number | boolean | null,
      instructionType: f.instructionType,
      sourceType: f.source.type,
      fileName: f.source.fileName,
      statementIndex: f.statementIndex ?? null,
      explicitlySupersedesPrevious: f.explicitlySupersedesPrevious ?? null,
    })),
    issues: [...r.issues],
  }));

  const statusCounts: Record<string, number> = {};
  for (const p of parts) bump(statusCounts, p.status);
  return { parts, statusCounts };
}

function splitIssues(codes: string[]): {
  blockingIssues: string[];
  warnings: string[];
  infoIssues: string[];
} {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const infoIssues: string[] = [];
  for (const code of codes) {
    const sev = classifyIssueSeverity(code);
    if (sev === "BLOCKING") blockingIssues.push(code);
    else if (sev === "INFO") infoIssues.push(code);
    else warnings.push(code);
  }
  return { blockingIssues, warnings, infoIssues };
}

function buildOutput(
  finalRows: FinalIntakeMappingRow[]
): AiIntakeDebugReportV1["output"] {
  const parts: DebugOutputPart[] = finalRows.map((r) => {
    const split = splitIssues(r.issues);
    return {
      partId: r.partId,
      finalStatus: r.status,
      quantity: r.quantity,
      thicknessMm: r.thicknessMm,
      material: r.material,
      dimensions: {
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        plateAreaMm2: r.plateAreaMm2,
      },
      ...split,
    };
  });

  let ready = 0;
  let readyWithWarnings = 0;
  let needsReview = 0;
  let excluded = 0;
  for (const p of parts) {
    if (p.finalStatus === "READY") {
      if (p.warnings.length > 0 || p.blockingIssues.length > 0) {
        readyWithWarnings += 1;
      } else {
        ready += 1;
      }
    } else if (p.finalStatus === "NEEDS_REVIEW") {
      needsReview += 1;
    } else if (p.finalStatus === "EXCLUDED") {
      excluded += 1;
    }
  }

  return {
    parts,
    counts: {
      ready,
      readyWithWarnings,
      needsReview,
      excluded,
      total: parts.length,
    },
  };
}

function collectDiagnostics(
  result: AiIntakeAnalyzeSuccess,
  documents: DebugDocumentReport[]
): AiIntakeDebugReportV1["diagnostics"] {
  const issues: DebugDiagnosticIssue[] = [];

  for (const w of result.warnings) {
    issues.push({
      code: w.includes(":") ? w.slice(0, w.indexOf(":")) : w,
      severity: classifyIssueSeverity(w),
      message: w,
      field: null,
      documentId: null,
      occurrenceId: null,
      partId: null,
      sourceType: null,
      fileName: null,
      sheetName: null,
      rowNumber: null,
      pageNumber: null,
      cellReferences: [],
      originalLocation: null,
    });
  }

  for (const doc of documents) {
    for (const msg of doc.validationMessages) {
      issues.push({
        code: msg.includes(":") ? msg.slice(0, msg.indexOf(":")) : msg,
        severity: classifyIssueSeverity(msg),
        message: msg,
        field: null,
        documentId: doc.documentId,
        occurrenceId: null,
        partId: null,
        sourceType: doc.sourceType,
        fileName: doc.fileName,
        sheetName: null,
        rowNumber: null,
        pageNumber: null,
        cellReferences: [],
        originalLocation: null,
      });
    }

    for (const nm of doc.normalizedMeasurements) {
      const row = asRecord(nm);
      if (!row) continue;
      const occurrenceId =
        typeof row.occurrenceId === "string" ? row.occurrenceId : null;
      const partId = typeof row.partId === "string" ? row.partId : null;
      const rowNumber =
        typeof row.rowNumber === "number" ? row.rowNumber : null;
      for (const iss of asArray(row.issues)) {
        const structured = asRecord(iss);
        if (structured && typeof structured.code === "string") {
          issues.push({
            code: structured.code,
            severity:
              structured.severity === "BLOCKING" ||
              structured.severity === "WARNING" ||
              structured.severity === "INFO"
                ? structured.severity
                : classifyIssueSeverity(structured.code),
            message:
              typeof structured.message === "string"
                ? structured.message
                : structured.code,
            field:
              typeof structured.field === "string" ? structured.field : null,
            documentId: doc.documentId,
            occurrenceId,
            partId,
            sourceType: doc.sourceType,
            fileName: doc.fileName,
            sheetName: null,
            rowNumber,
            pageNumber: null,
            cellReferences: [],
            originalLocation:
              rowNumber != null ? `row ${rowNumber}` : occurrenceId,
          });
        }
      }
      for (const field of [
        "thickness",
        "width",
        "height",
        "area",
        "totalArea",
        "unitWeight",
        "totalWeight",
      ] as const) {
        const m = asRecord(row[field]);
        if (!m) continue;
        for (const iss of asArray(m.issues)) {
          const structured = asRecord(iss);
          if (structured && typeof structured.code === "string") {
            issues.push({
              code: structured.code,
              severity:
                structured.severity === "BLOCKING" ||
                structured.severity === "WARNING" ||
                structured.severity === "INFO"
                  ? structured.severity
                  : classifyIssueSeverity(structured.code),
              message:
                typeof structured.message === "string"
                  ? structured.message
                  : structured.code,
              field: field.toUpperCase(),
              documentId: doc.documentId,
              occurrenceId,
              partId,
              sourceType: doc.sourceType,
              fileName: doc.fileName,
              sheetName: null,
              rowNumber,
              pageNumber: null,
              cellReferences: [],
              originalLocation:
                rowNumber != null ? `row ${rowNumber}` : occurrenceId,
            });
          }
        }
      }
    }

    for (const profile of doc.columnUnitProfiles) {
      const p = asRecord(profile);
      if (!p) continue;
      for (const iss of asArray(p.issues)) {
        const structured = asRecord(iss);
        if (structured && typeof structured.code === "string") {
          issues.push({
            code: structured.code,
            severity:
              structured.severity === "BLOCKING" ||
              structured.severity === "WARNING" ||
              structured.severity === "INFO"
                ? structured.severity
                : classifyIssueSeverity(structured.code),
            message:
              typeof structured.message === "string"
                ? structured.message
                : structured.code,
            field:
              typeof p.semanticField === "string" ? p.semanticField : null,
            documentId: doc.documentId,
            occurrenceId: null,
            partId: null,
            sourceType: doc.sourceType,
            fileName: doc.fileName,
            sheetName:
              typeof p.sheetName === "string" ? p.sheetName : null,
            rowNumber: null,
            pageNumber: null,
            cellReferences: asArray(p.headerCellReferences).map(String),
            originalLocation:
              typeof p.columnLetter === "string"
                ? `col ${p.columnLetter}`
                : null,
          });
        }
      }
    }
  }

  for (const row of result.finalRows ?? []) {
    for (const code of row.issues) {
      issues.push({
        code,
        severity: classifyIssueSeverity(code),
        message: code,
        field: null,
        documentId: null,
        occurrenceId: null,
        partId: row.partId,
        sourceType: null,
        fileName: row.dxfFilename,
        sheetName: null,
        rowNumber: null,
        pageNumber: null,
        cellReferences: [],
        originalLocation: row.partId,
      });
    }
  }

  const severityOrder = { BLOCKING: 0, WARNING: 1, INFO: 2 } as const;
  issues.sort((a, b) => {
    const s = severityOrder[a.severity] - severityOrder[b.severity];
    if (s !== 0) return s;
    const d = (a.documentId ?? "").localeCompare(b.documentId ?? "");
    if (d !== 0) return d;
    const r = (a.rowNumber ?? 0) - (b.rowNumber ?? 0);
    if (r !== 0) return r;
    return a.code.localeCompare(b.code);
  });

  const countsByCode: Record<string, number> = {};
  const countsBySeverity: Record<string, number> = {};
  for (const i of issues) {
    bump(countsByCode, i.code);
    bump(countsBySeverity, i.severity);
  }

  // Deduplicate display summary counts by code+message for summary totals,
  // but keep full issues list (row-level evidence preserved).
  const uniqueKeys = new Set(
    issues.map((i) => `${i.code}|${i.message}|${i.severity}`)
  );

  let workbookCoverageComplete: boolean | null = null;
  let noUnaccountedNonEmptyRows: boolean | null = null;
  const coverages = documents
    .map((d) => asRecord(d.coverage))
    .filter(Boolean) as Record<string, unknown>[];
  if (coverages.length > 0) {
    workbookCoverageComplete = coverages.every(
      (c) => c.coverageComplete === true
    );
    noUnaccountedNonEmptyRows = coverages.every(
      (c) =>
        typeof c.unaccountedNonEmptyRowCount === "number" &&
        c.unaccountedNonEmptyRowCount === 0
    );
  }

  const reconstructedIds = new Set<string>();
  let duplicateOccurrencesPreserved: boolean | null = null;
  for (const doc of documents) {
    const refs = new Map<string, number>();
    for (const raw of doc.reconstructedRows) {
      const r = asRecord(raw);
      if (!r) continue;
      const occ =
        typeof r.occurrenceId === "string" ? r.occurrenceId : null;
      if (occ) reconstructedIds.add(occ);
      const part =
        typeof r.rawPartReference === "string"
          ? r.rawPartReference
          : typeof r.matchedDxfPartId === "string"
            ? r.matchedDxfPartId
            : null;
      if (part) refs.set(part, (refs.get(part) ?? 0) + 1);
    }
    if ([...refs.values()].some((n) => n > 1)) {
      duplicateOccurrencesPreserved = true;
    }
  }
  if (duplicateOccurrencesPreserved == null && reconstructedIds.size > 0) {
    duplicateOccurrencesPreserved = true;
  }

  let missingValuesRemainNull: boolean | null = null;
  for (const doc of documents) {
    for (const nm of doc.normalizedMeasurements) {
      const row = asRecord(nm);
      const th = asRecord(row?.thickness);
      if (!th) continue;
      const raw = asRecord(th.raw);
      if (
        raw &&
        raw.rawValue == null &&
        th.normalizedValue == null &&
        th.resolutionStatus === "NOT_PRESENT"
      ) {
        missingValuesRemainNull = true;
      }
      if (
        raw &&
        raw.rawValue == null &&
        typeof th.normalizedValue === "number"
      ) {
        missingValuesRemainNull = false;
      }
    }
  }

  return {
    summary: {
      totalIssues: uniqueKeys.size,
      blocking: countsBySeverity.BLOCKING ?? 0,
      warnings: countsBySeverity.WARNING ?? 0,
      info: countsBySeverity.INFO ?? 0,
    },
    countsByCode,
    countsBySeverity,
    issues,
    invariants: {
      workbookCoverageComplete,
      noUnaccountedNonEmptyRows,
      duplicateOccurrencesPreserved,
      missingValuesRemainNull,
      noAdditionalOpenAiCalls: true,
    },
  };
}

/**
 * Build the canonical lab debug report from an analyze success payload
 * plus optional lab-side context (DXF registry, email body, file metadata).
 */
export function buildAiIntakeDebugReport(
  result: AiIntakeAnalyzeSuccess,
  context: AiIntakeDebugReportContext = {}
): AiIntakeDebugReportV1 {
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  const finalRows = result.finalRows ?? [];

  const documents = result.aggregated.documents.map(buildDocumentReport);

  const dxfParts = context.dxfParts ?? [];
  const inputDocuments =
    context.inputDocuments ??
    result.aggregated.documents.map((d) => ({
      documentId: d.documentId,
      sourceType: d.sourceType,
      fileName: d.fileName,
      mimeType: null,
      sizeBytes: null,
    }));
  const emails = context.emails ?? [];

  const report: AiIntakeDebugReportV1 = {
    schemaVersion: AI_INTAKE_DEBUG_REPORT_SCHEMA_VERSION,
    generatedAt,
    run: {
      status: result.partial ? "PARTIAL" : "SUCCESS",
      partial: result.partial,
      durationMs: result.debug.durationMs ?? null,
      openaiCallCount: result.debug.openaiCallCount ?? null,
      usage: usageOrNull(result.debug.usage),
      perDocumentUsage: result.debug.perSourceUsage.map((u) => ({
        label: u.label,
        documentId: null,
        status: u.status,
        durationMs: u.durationMs ?? null,
        usage: {
          inputTokens: u.inputTokens ?? null,
          outputTokens: u.outputTokens ?? null,
          totalTokens: u.totalTokens ?? null,
        },
      })),
      model: result.debug.model ?? null,
      startedAt: null,
      completedAt: null,
    },
    inputs: {
      dxf: {
        partCount: dxfParts.length,
        parts: dxfParts,
      },
      documents: inputDocuments,
      emails,
    },
    documents,
    matching: buildMatching(result),
    facts: buildFacts(result),
    reconciliation: buildReconciliation(finalRows),
    output: buildOutput(finalRows),
    diagnostics: collectDiagnostics(result, documents),
  };

  return report;
}

export function summarizeDebugReportStats(
  report: AiIntakeDebugReportV1,
  serializedJson?: string
): {
  schemaVersion: string;
  charCount: number;
  sizeKb: number;
  documentCount: number;
  dxfPartCount: number;
  sourceRowCount: number;
  finalPartCount: number;
  issueCount: number;
} {
  const json = serializedJson ?? serializeAiIntakeDebugReport(report);
  const sourceRowCount = report.documents.reduce(
    (n, d) =>
      n +
      Math.max(
        d.reconstructedRows.length,
        d.extractedRows.length,
        d.normalizedMeasurements.length
      ),
    0
  );
  return {
    schemaVersion: report.schemaVersion,
    charCount: json.length,
    sizeKb: Math.round((json.length / 1024) * 10) / 10,
    documentCount: report.documents.length,
    dxfPartCount: report.inputs.dxf.partCount,
    sourceRowCount,
    finalPartCount: report.output.counts.total,
    issueCount: report.diagnostics.summary.totalIssues,
  };
}
