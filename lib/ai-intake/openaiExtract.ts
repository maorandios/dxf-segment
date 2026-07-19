import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { expandExtractionToFacts } from "./expandExtractionToFacts";
import { classifySourceForProviderExtraction } from "./provider/classifySourceForProviderExtraction";
import {
  emailExtractionSchema,
  singleDocumentExtractionSchema,
  emptyDocumentGeometry,
  type AggregatedSourceExtraction,
  type AiRequestExtraction,
  type ExtractedDocumentRow,
  type ExtractedEmailFact,
  type SlimRegistryItem,
  type SourceDocumentDescriptor,
  type SourceDocumentResult,
  type UnresolvedRequestItem,
  type WorkbookEvidenceDebug,
} from "./schemas";
import { validateSingleDocumentExtraction } from "./validateDocumentExtraction";
import { normalizeEmailFacts } from "./emailFactNormalize";
import {
  buildWorkbookSnapshot,
  normalizedPartRowToExtractedDocumentRow,
  normalizeWorkbookPartRows,
} from "./normalization";
import { interpretWorkbook } from "./workbook/interpreter";
import { workbookInterpreterDebugSummary } from "./workbook/interpreter/workbookInterpreterDebug";
import { planToSyntheticMapping } from "./workbook/interpreter/planToSyntheticMapping";
import {
  buildDirectWorkbookExtractionDebugDto,
  directExtractionToSyntheticMapping,
  extractWorkbookDirect,
  resolveWorkbookExtractionMode,
} from "./workbook/direct-extraction";
import type { WorkbookSnapshot } from "./normalization/types";
import type { RawDocumentPartRow } from "./normalization/types";
import type { AiWorkbookMappingResult } from "./normalization/types";


export type DocumentFileInput = {
  documentId: string;
  sourceType: "XLSX" | "PDF";
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

function mimeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

const DOCUMENT_SYSTEM_INSTRUCTIONS = `You extract RFQ part rows from ONE customer document (a single XLSX/XLS or PDF file) for a CNC plate quoting lab.

YOUR ONLY JOB:
- Extract every relevant part row from THIS SINGLE document.
- Do NOT compare documents. Do NOT reconcile. Do NOT invent values from other files.
- You receive exactly one attached file. There is no email body and no other documents.

OUTPUT STRUCTURE (strict):
1. rows — one COMPLETE row object per identified part line in this document.
2. unresolvedItems — references in this document that cannot be mapped reliably.
3. warnings — short extraction warnings about THIS document only.

COMPLETENESS:
- For every identified part row, return quantity, thicknessMm, material, description, notes, action when present on that row.
- Prefer sheetName + visibleRowNumber for XLSX when visible.
- Prefer pageNumber for PDF when visible.
- Fill cell addresses when known (e.g. "A5", "B5"); otherwise null.
- excerpt should be a short raw line/snippet from THIS document.

DOCUMENT GEOMETRY (documentGeometry — evidence only):
- Extract explicit numeric width/height/area/perimeter/weight ONLY when present as structured fields or clear numeric columns.
- Preserve units exactly as stated: MM, CM, M for length; MM2, CM2, M2 for area.
- Do NOT convert units. Do NOT reinterpret suspicious units.
- If a header says meters (m) but values look like millimeters, keep unit M and add issue DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS.
- Do NOT calculate missing dimensions from area.
- Do NOT derive geometry from the DXF registry.
- Do NOT parse geometry from free-text description/notes (e.g. "Plate 300 x 300 mm").
- If no geometry columns exist, set all documentGeometry fields to null.

MATCHING:
- matchedDxfPartId may ONLY be a canonicalPartId from the DXF registry.
- If uncertain, set matchedDxfPartId to null and use unresolvedItems.
- False matches are more harmful than unresolved rows.
- Formatting-only variations MAY map: P-100, P_100, P 100, p100 → P100.
- Never select the numerically closest part or repair a changed digit (P1084 ≠ P1094).
- Do not calculate dimensions, area, weight, nesting, or pricing for missing values.
- No chain-of-thought. Keep excerpts short (<240 chars).

Do NOT invent a file name. Location fields describe where the data appears inside the attached file.`;

const EMAIL_SYSTEM_INSTRUCTIONS = `You extract RFQ instructions from a customer email for a CNC plate quoting lab.

YOUR ONLY JOB:
- Extract email facts (VALUE / DEFAULT / OVERRIDE / EXCLUSION) from the email text.
- You do NOT receive XLSX or PDF attachments. Do not invent document rows.

OUTPUT STRUCTURE (strict):
1. emailFacts — one fact object per explicit statement in the email (do not merge).
2. unresolvedItems — email references that cannot be mapped reliably.
3. warnings — short warnings.

CRITICAL — PRESERVE EVERY STATEMENT:
- Return ONE emailFact for EVERY explicit part-specific field value occurrence.
- If the email says quantity 28 and later quantity 30, return BOTH facts.
- Do NOT summarize, merge, or keep only the latest mention.
- statementIndex is 1-based in email appearance order.
- factId must be unique (e.g. "email:1:QUANTITY", "email:2:QUANTITY").

explicitlySupersedesPrevious:
- true ONLY when the statement clearly replaces/ignores a previous value
  (e.g. "במקום 28", "התעלם מהכמות הקודמת", "עודכנה מ־28 ל־30",
  "הכמות הסופית היא 30", "לא 28 אלא 30", "updated from 28 to 30").
- false for mere additional mentions or sequence words such as
  "בהמשך", "לאחר מכן", "בנוסף", "וגם" without replacement language.
- Do NOT infer supersession from statement order alone.

OTHER RULES:
- Use instructionType OVERRIDE only for clear corrections/replacements.
- sourceExcerpt must quote the relevant email phrase.
- matchedDxfPartId may ONLY be a canonicalPartId from the DXF registry.
- If uncertain, set matchedDxfPartId to null and use unresolvedItems.
- Formatting-only variations MAY map: P-100 → P100.
- Never repair digits (P1084 ≠ P1094).
- No chain-of-thought. Keep excerpts short (<240 chars).`;

type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

function usageFromResponse(usage: {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
} | null | undefined): TokenUsage {
  return {
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

function sumUsage(parts: TokenUsage[]): TokenUsage {
  let input = 0;
  let output = 0;
  let total = 0;
  let hasInput = false;
  let hasOutput = false;
  let hasTotal = false;
  for (const u of parts) {
    if (u.inputTokens != null) {
      input += u.inputTokens;
      hasInput = true;
    }
    if (u.outputTokens != null) {
      output += u.outputTokens;
      hasOutput = true;
    }
    if (u.totalTokens != null) {
      total += u.totalTokens;
      hasTotal = true;
    }
  }
  return {
    inputTokens: hasInput ? input : null,
    outputTokens: hasOutput ? output : null,
    totalTokens: hasTotal ? total : null,
  };
}

function getClientAndModel(): { client: OpenAI; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_EXTRACTION_MODEL?.trim();
  if (!apiKey) {
    throw Object.assign(new Error("MISSING_API_KEY"), { code: "MISSING_API_KEY" });
  }
  if (!model) {
    throw Object.assign(new Error("MISSING_MODEL_ENV"), {
      code: "MISSING_MODEL_ENV",
    });
  }
  return { client: new OpenAI({ apiKey }), model };
}

function injectDocumentMetadata(
  descriptor: SourceDocumentDescriptor,
  modelRows: ReturnType<typeof singleDocumentExtractionSchema.parse>["rows"],
  registry: SlimRegistryItem[]
): { rows: ExtractedDocumentRow[]; warnings: string[] } {
  const ids = new Set(registry.map((r) => r.canonicalPartId));
  const warnings: string[] = [];
  const rows: ExtractedDocumentRow[] = modelRows.map((row, index) => {
    let matchedDxfPartId = row.matchedDxfPartId;
    if (matchedDxfPartId != null && !ids.has(matchedDxfPartId)) {
      warnings.push(
        `Rejected unknown matchedDxfPartId "${matchedDxfPartId}" on ${descriptor.fileName} row ${index}`
      );
      matchedDxfPartId = null;
    }
    return {
      documentId: descriptor.documentId,
      matchedDxfPartId,
      rawPartReference: row.rawPartReference,
      quantity: row.quantity,
      thicknessMm: row.thicknessMm,
      material: row.material,
      description: row.description,
      notes: row.notes,
      action: row.action,
      documentGeometry: row.documentGeometry ?? emptyDocumentGeometry(),
      source: {
        type: descriptor.sourceType,
        fileName: descriptor.fileName,
        sheetName: row.location.sheetName,
        rowNumber: row.location.visibleRowNumber,
        pageNumber: row.location.pageNumber,
        partReferenceCell: row.location.partReferenceCell,
        quantityCell: row.location.quantityCell,
        thicknessCell: row.location.thicknessCell,
        materialCell: row.location.materialCell,
        excerpt: row.location.excerpt,
      },
      issues: [...row.issues],
    };
  });
  return { rows, warnings };
}

function mapModelUnresolved(
  descriptor: SourceDocumentDescriptor,
  items: ReturnType<typeof singleDocumentExtractionSchema.parse>["unresolvedItems"]
): UnresolvedRequestItem[] {
  return items.map((item) => ({
    rawPartReference: item.rawPartReference,
    description: item.description,
    possibleDxfPartIds: [],
    reason: item.reason,
    source: {
      type: descriptor.sourceType,
      fileName: descriptor.fileName,
      sheetName: item.location.sheetName,
      rowNumber: item.location.visibleRowNumber,
      cellReferences: [],
      pageNumber: item.location.pageNumber,
      excerpt: item.location.excerpt,
    },
  }));
}

/**
 * Deduplicate only exact duplicate extraction rows from the same document/location.
 * Never collapse identical part IDs across different documents.
 */
export function dedupeExactSameDocumentRows(
  rows: ExtractedDocumentRow[]
): ExtractedDocumentRow[] {
  const seen = new Set<string>();
  const out: ExtractedDocumentRow[] = [];
  for (const row of rows) {
    const key = [
      row.documentId,
      row.source.sheetName ?? "",
      row.source.rowNumber ?? "",
      row.source.pageNumber ?? "",
      row.rawPartReference ?? "",
      row.matchedDxfPartId ?? "",
      row.quantity ?? "",
      row.thicknessMm ?? "",
      row.material ?? "",
      row.source.partReferenceCell ?? "",
      row.source.quantityCell ?? "",
    ].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function extractSingleDocumentWithOpenAI(args: {
  client: OpenAI;
  model: string;
  document: DocumentFileInput;
  registry: SlimRegistryItem[];
}): Promise<SourceDocumentResult> {
  const descriptor: SourceDocumentDescriptor = {
    documentId: args.document.documentId,
    sourceType: args.document.sourceType,
    fileName: args.document.filename,
  };

  const started = Date.now();
  const mime = args.document.mimeType || mimeForFilename(args.document.filename);
  const isPdf =
    args.document.sourceType === "PDF" ||
    args.document.filename.toLowerCase().endsWith(".pdf") ||
    mime === "application/pdf";

  if (!isPdf) {
    return extractSpreadsheetDocument({
      client: args.client,
      model: args.model,
      document: args.document,
      registry: args.registry,
      descriptor,
      started,
    });
  }

  try {
    const registryJson = JSON.stringify(args.registry, null, 2);
    const userText = [
      "Extract every relevant part row from the SINGLE attached document.",
      "Do not compare or reconcile with any other document.",
      "",
      `Authoritative source (server-assigned; do not invent fileName):`,
      `documentId=${descriptor.documentId}`,
      `sourceType=${descriptor.sourceType}`,
      `fileName=${descriptor.fileName}`,
      "",
      "DXF_PART_REGISTRY (canonicalPartId only — map only to these IDs):",
      registryJson,
      "",
      "The attached file follows. DXF files are NOT attached. Email is NOT included.",
    ].join("\n");

    type ContentPart =
      | { type: "input_text"; text: string }
      | {
          type: "input_file";
          filename: string;
          file_data: string;
          detail?: "high" | "low" | "auto";
        };

    const content: ContentPart[] = [
      { type: "input_text", text: userText },
      {
        type: "input_file",
        filename: args.document.filename,
        file_data: toDataUrl(args.document.buffer, mime),
        detail: "high",
      },
    ];

    const response = await args.client.responses.parse({
      model: args.model,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: DOCUMENT_SYSTEM_INSTRUCTIONS },
        { role: "user", content },
      ],
      text: {
        format: zodTextFormat(
          singleDocumentExtractionSchema,
          "single_document_extraction"
        ),
      },
    });

    const durationMs = Date.now() - started;
    const parsed = response.output_parsed;
    if (!parsed) {
      throw Object.assign(new Error("OPENAI_SCHEMA"), { code: "OPENAI_SCHEMA" });
    }
    const modelResult = singleDocumentExtractionSchema.parse(parsed);
    const injected = injectDocumentMetadata(
      descriptor,
      modelResult.rows,
      args.registry
    );
    const validated = validateSingleDocumentExtraction(
      {
        ...descriptor,
        rows: dedupeExactSameDocumentRows(injected.rows),
        unresolvedItems: mapModelUnresolved(descriptor, modelResult.unresolvedItems),
        warnings: [
          ...modelResult.warnings,
          ...injected.warnings,
        ],
      },
      args.registry
    );

    return {
      documentId: descriptor.documentId,
      sourceType: descriptor.sourceType,
      fileName: descriptor.fileName,
      rows: validated.rows,
      unresolvedItems: validated.unresolvedItems,
      warnings: validated.warnings,
      status: "SUCCESS",
      errorCode: null,
      usage: usageFromResponse(response.usage),
      durationMs,
      workbookEvidence: null,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "OPENAI_FAILED";
    console.error(
      `[ai-intake] document extraction failed ${descriptor.fileName}`,
      err
    );
    return {
      documentId: descriptor.documentId,
      sourceType: descriptor.sourceType,
      fileName: descriptor.fileName,
      rows: [],
      unresolvedItems: [],
      warnings: [`SOURCE_EXTRACTION_FAILED:${descriptor.fileName}:${code}`],
      status: "FAILED",
      errorCode: code,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      durationMs: Date.now() - started,
      workbookEvidence: null,
    };
  }
}

async function extractSpreadsheetDocument(args: {
  client: OpenAI;
  model: string;
  document: DocumentFileInput;
  registry: SlimRegistryItem[];
  descriptor: SourceDocumentDescriptor;
  started: number;
}): Promise<SourceDocumentResult> {
  const { descriptor, started } = args;
  const emptyUsage = {
    inputTokens: null as number | null,
    outputTokens: null as number | null,
    totalTokens: null as number | null,
  };

  const parsedSnap = await buildWorkbookSnapshot({
    documentId: descriptor.documentId,
    fileName: descriptor.fileName,
    buffer: args.document.buffer,
  });

  if (!parsedSnap.ok) {
    return {
      documentId: descriptor.documentId,
      sourceType: descriptor.sourceType,
      fileName: descriptor.fileName,
      rows: [],
      unresolvedItems: [],
      warnings: parsedSnap.warnings,
      status: "FAILED",
      errorCode: "WORKBOOK_PARSE_FAILED",
      usage: emptyUsage,
      durationMs: Date.now() - started,
      workbookEvidence: null,
    };
  }

  const snapshot = parsedSnap.snapshot;
  const warnings: string[] = [
    ...snapshot.warnings,
    `WORKBOOK_PARSER_KIND:${snapshot.parserKind}`,
  ];

  const extractionMode = resolveWorkbookExtractionMode();
  warnings.push(`WORKBOOK_EXTRACTION_MODE:${extractionMode}`);

  if (extractionMode === "AI_DIRECT") {
    return extractSpreadsheetDocumentDirect({
      client: args.client,
      model: args.model,
      document: args.document,
      registry: args.registry,
      descriptor,
      started,
      snapshot,
      warnings,
    });
  }

  // LEGACY_PLAN: profile → plan → execute → validate (max 2 AI planner calls).
  return extractSpreadsheetDocumentLegacyPlan({
    client: args.client,
    model: args.model,
    registry: args.registry,
    descriptor,
    started,
    snapshot,
    warnings,
  });
}

function buildCoverageFromDirect(args: {
  snapshot: WorkbookSnapshot;
  ledger: Array<{ classification: string }>;
  partRowCount: number;
}): Record<string, unknown> {
  void args.snapshot;
  const meaningful = args.ledger.length;
  const classified = args.ledger.filter(
    (e) => e.classification !== "UNPROCESSED"
  ).length;
  const count = (c: string) =>
    args.ledger.filter((e) => e.classification === c).length;
  return {
    sourceNonEmptyRowCount: meaningful,
    accountedNonEmptyRowCount: classified,
    mappedPartRowCount: args.partRowCount,
    mappedHeaderRowCount: count("HEADER") + count("REPEATED_HEADER"),
    mappedSubtotalRowCount: count("SUBTOTAL"),
    mappedTotalRowCount: count("TOTAL"),
    mappedNoteRowCount: count("NOTE") + count("FOOTER"),
    mappedEmptyRowCount: count("BLANK"),
    unknownNonEmptyRowCount: count("UNPROCESSED") + count("AMBIGUOUS"),
    unaccountedNonEmptyRowCount: count("UNPROCESSED"),
    coverageComplete: count("UNPROCESSED") === 0,
    issues: [],
    missingRowKeys: [],
    nonEmptyRowCount: meaningful,
    mappedRowCount: classified,
    unknownRowCount: count("UNPROCESSED") + count("AMBIGUOUS"),
  };
}

function finalizeWorkbookSuccess(args: {
  descriptor: SourceDocumentDescriptor;
  started: number;
  warnings: string[];
  snapshot: WorkbookSnapshot;
  mapping: AiWorkbookMappingResult;
  partRows: RawDocumentPartRow[];
  registry: SlimRegistryItem[];
  coverage: unknown;
  excludedTotalSubtotalRows: unknown[];
  workbookInterpreterDiagnostics?: unknown;
  directWorkbookExtraction?: unknown;
  workbookExtractionMode: "AI_DIRECT" | "LEGACY_PLAN";
  emptyUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  skipDxfMatching?: boolean;
  suppressDxfOrphans?: boolean;
}): SourceDocumentResult {
  const normalized = normalizeWorkbookPartRows({
    documentId: args.descriptor.documentId,
    mapping: args.mapping,
    partRows: args.partRows,
    registry: args.registry,
  });
  const warnings = [...args.warnings];
  for (const nr of normalized.normalizedRows) {
    for (const issue of nr.issues) {
      if (issue.severity === "WARNING" || issue.severity === "BLOCKING") {
        const tag = `${issue.code}:${nr.raw.occurrenceId}`;
        if (!warnings.includes(tag)) warnings.push(tag);
      }
    }
  }

  const adaptedRows = normalized.normalizedRows.map((r) =>
    normalizedPartRowToExtractedDocumentRow(r)
  );

  const validated = validateSingleDocumentExtraction(
    {
      ...args.descriptor,
      rows: dedupeExactSameDocumentRows(adaptedRows),
      unresolvedItems: [],
      warnings,
    },
    args.registry
  );

  const workbookEvidence: WorkbookEvidenceDebug = {
    parserKind: args.snapshot.parserKind,
    snapshot: {
      documentId: args.snapshot.documentId,
      fileName: args.snapshot.fileName,
      parserKind: args.snapshot.parserKind,
      sheets: args.snapshot.sheets.map((s) => ({
        sheetName: s.sheetName,
        usedRange: s.usedRange,
        mergedRanges: s.mergedRanges,
        hidden: s.hidden,
        cellCount: s.cells.length,
        cells: s.cells,
      })),
      warnings: args.snapshot.warnings,
    },
    mapping: args.mapping,
    coverage: args.coverage,
    rawPartRows: args.partRows,
    excludedTotalSubtotalRows: args.excludedTotalSubtotalRows,
    unknownRows: [],
    hiddenPartRowsRequiringReview: [],
    columnUnitProfiles: normalized.profiles,
    normalizedMeasurements: normalized.normalizedRows.map((nr) => ({
      occurrenceId: nr.raw.occurrenceId,
      partId: nr.raw.matchedDxfPartId,
      rowNumber: nr.raw.source.rowNumber,
      thickness: nr.thickness,
      width: nr.width,
      height: nr.height,
      area: nr.area,
      totalArea: nr.totalArea,
      unitWeight: nr.unitWeight,
      totalWeight: nr.totalWeight,
      issues: nr.issues,
    })),
    precisionComparisons: normalized.precisionComparisons,
    tableUnitInference: normalized.tableUnitInferences,
    massInterpretation: normalized.massInterpretation ?? null,
    massInterpretationDebug: normalized.massInterpretationDebug ?? null,
    workbookInterpreterDiagnostics: args.workbookInterpreterDiagnostics,
    directWorkbookExtraction: args.directWorkbookExtraction,
    workbookExtractionMode: args.workbookExtractionMode,
    skipDxfMatching: args.skipDxfMatching ?? false,
    suppressDxfOrphans: args.suppressDxfOrphans ?? false,
  };

  return {
    documentId: args.descriptor.documentId,
    sourceType: args.descriptor.sourceType,
    fileName: args.descriptor.fileName,
    rows: validated.rows,
    unresolvedItems: validated.unresolvedItems,
    warnings: validated.warnings,
    status: "SUCCESS" as const,
    errorCode: null,
    usage: args.emptyUsage,
    durationMs: Date.now() - args.started,
    workbookEvidence,
  };
}

async function extractSpreadsheetDocumentDirect(args: {
  client: OpenAI;
  model: string;
  document: DocumentFileInput;
  registry: SlimRegistryItem[];
  descriptor: SourceDocumentDescriptor;
  started: number;
  snapshot: WorkbookSnapshot;
  warnings: string[];
}): Promise<SourceDocumentResult> {
  void args.document; // reserved for future native workbook-file provider input
  const { descriptor, started, snapshot } = args;
  const emptyUsage = {
    inputTokens: null as number | null,
    outputTokens: null as number | null,
    totalTokens: null as number | null,
  };
  const warnings = [...args.warnings];

  try {
    const direct = await extractWorkbookDirect({
      snapshot,
      client: args.client,
      model: args.model,
    });
    warnings.push(...direct.warnings);
    warnings.push(
      `WORKBOOK_DIRECT_PROVIDER_CALLS:${direct.diagnostics.providerCallCount}`
    );

    const debugDto = buildDirectWorkbookExtractionDebugDto({
      diagnostics: direct.diagnostics,
      extraction: direct.extraction,
      verification: direct.verification,
      mappingRequired: direct.mappingRequired,
      partRowCount: direct.partRows.length,
    });

    if (
      direct.status === "MAPPING_REQUIRED" ||
      direct.status === "TOO_LARGE" ||
      direct.status === "TIMEOUT" ||
      direct.status === "FAIL"
    ) {
      const isFail =
        direct.status === "FAIL" || direct.status === "TIMEOUT";
      const errorCode = isFail
        ? direct.failure?.code ??
          (direct.status === "TIMEOUT"
            ? "WORKBOOK_DIRECT_PROVIDER_TIMEOUT"
            : "WORKBOOK_DIRECT_EXTRACTION_FAILED")
        : direct.status === "TOO_LARGE"
          ? "WORKBOOK_MAPPING_REQUIRED"
          : "WORKBOOK_MAPPING_REQUIRED";
      return {
        documentId: descriptor.documentId,
        sourceType: descriptor.sourceType,
        fileName: descriptor.fileName,
        rows: [],
        unresolvedItems: [],
        warnings: [
          ...warnings,
          isFail
            ? `WORKBOOK_DIRECT_EXTRACTION_FAILED:${direct.failure?.stage ?? "UNKNOWN"}:${errorCode}`
            : "WORKBOOK_MAPPING_REQUIRED",
          ...(direct.failure
            ? [
                `FAILURE_STAGE:${direct.failure.stage}`,
                `FAILURE_MESSAGE:${direct.failure.message}`,
              ]
            : []),
          ...(direct.mappingRequired?.reasons ?? []),
        ],
        status: isFail ? ("FAILED" as const) : ("PARTIAL" as const),
        errorCode,
        usage: emptyUsage,
        durationMs: Date.now() - started,
        workbookEvidence: {
          parserKind: snapshot.parserKind,
          snapshot,
          mapping: null,
          coverage: null,
          rawPartRows: [],
          excludedTotalSubtotalRows: [],
          unknownRows: [],
          hiddenPartRowsRequiringReview: [],
          directWorkbookExtraction: debugDto,
          workbookExtractionMode: "AI_DIRECT",
          skipDxfMatching: true,
          suppressDxfOrphans: true,
        },
      };
    }

    if (!direct.extraction || !direct.verification) {
      return {
        documentId: descriptor.documentId,
        sourceType: descriptor.sourceType,
        fileName: descriptor.fileName,
        rows: [],
        unresolvedItems: [],
        warnings: [...warnings, "WORKBOOK_DIRECT_EXTRACTION_FAILED"],
        status: "FAILED" as const,
        errorCode: "WORKBOOK_DIRECT_EXTRACTION_FAILED",
        usage: emptyUsage,
        durationMs: Date.now() - started,
        workbookEvidence: {
          parserKind: snapshot.parserKind,
          snapshot,
          mapping: null,
          coverage: null,
          rawPartRows: [],
          excludedTotalSubtotalRows: [],
          unknownRows: [],
          hiddenPartRowsRequiringReview: [],
          directWorkbookExtraction: debugDto,
          workbookExtractionMode: "AI_DIRECT",
          skipDxfMatching: true,
          suppressDxfOrphans: true,
        },
      };
    }

    const mapping = directExtractionToSyntheticMapping(direct.extraction);
    const coverage = buildCoverageFromDirect({
      snapshot,
      ledger: direct.extraction.sourceRowLedger,
      partRowCount: direct.partRows.length,
    });

    const excluded = direct.extraction.sourceRowLedger
      .filter(
        (e) =>
          e.classification === "TOTAL" ||
          e.classification === "SUBTOTAL" ||
          e.classification === "FOOTER"
      )
      .map((e) => ({
        sheetName: e.sheetName,
        rowNumber: e.rowNumber,
        classification: e.classification,
        reason: e.reason,
      }));

    return finalizeWorkbookSuccess({
      descriptor,
      started,
      warnings,
      snapshot,
      mapping,
      partRows: direct.partRows,
      registry: args.registry,
      coverage,
      excludedTotalSubtotalRows: excluded,
      directWorkbookExtraction: {
        ...debugDto,
        skipDxfMatching: direct.skipDxfMatching,
        suppressDxfOrphans: direct.suppressDxfOrphans,
      },
      workbookExtractionMode: "AI_DIRECT",
      emptyUsage,
      skipDxfMatching: direct.skipDxfMatching,
      suppressDxfOrphans: direct.suppressDxfOrphans,
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "WORKBOOK_DIRECT_EXTRACTION_FAILED";
    console.error(
      `[ai-intake] direct workbook extraction failed ${descriptor.fileName}`,
      err
    );
    return {
      documentId: descriptor.documentId,
      sourceType: descriptor.sourceType,
      fileName: descriptor.fileName,
      rows: [],
      unresolvedItems: [],
      warnings: [
        ...warnings,
        `SOURCE_EXTRACTION_FAILED:${descriptor.fileName}:${code}`,
      ],
      status: "FAILED",
      errorCode: code,
      usage: emptyUsage,
      durationMs: Date.now() - started,
      workbookEvidence: {
        parserKind: snapshot.parserKind,
        snapshot,
        mapping: null,
        coverage: null,
        rawPartRows: [],
        excludedTotalSubtotalRows: [],
        unknownRows: [],
        hiddenPartRowsRequiringReview: [],
        workbookExtractionMode: "AI_DIRECT",
      },
    };
  }
}

async function extractSpreadsheetDocumentLegacyPlan(args: {
  client: OpenAI;
  model: string;
  registry: SlimRegistryItem[];
  descriptor: SourceDocumentDescriptor;
  started: number;
  snapshot: WorkbookSnapshot;
  warnings: string[];
}): Promise<SourceDocumentResult> {
  const { descriptor, started, snapshot } = args;
  const emptyUsage = {
    inputTokens: null as number | null,
    outputTokens: null as number | null,
    totalTokens: null as number | null,
  };
  const warnings = [...args.warnings];

  try {
    const interpreted = await interpretWorkbook({
      snapshot,
      client: args.client,
      model: args.model,
      allowAiPlanner: true,
    });
    warnings.push(...interpreted.warnings);

    if (interpreted.status === "MAPPING_REQUIRED") {
      return {
        documentId: descriptor.documentId,
        sourceType: descriptor.sourceType,
        fileName: descriptor.fileName,
        rows: [],
        unresolvedItems: [],
        warnings: [
          ...warnings,
          "WORKBOOK_MAPPING_REQUIRED",
          ...(interpreted.mappingRequired?.reasons ?? []),
        ],
        status: "PARTIAL" as const,
        errorCode: "WORKBOOK_MAPPING_REQUIRED",
        usage: emptyUsage,
        durationMs: Date.now() - started,
        workbookEvidence: {
          parserKind: snapshot.parserKind,
          snapshot,
          mapping: interpreted.plan
            ? { interpreterPlan: interpreted.plan }
            : null,
          coverage: interpreted.execution?.coverage ?? null,
          rawPartRows: [],
          excludedTotalSubtotalRows: [],
          unknownRows: [],
          hiddenPartRowsRequiringReview: [],
          workbookInterpreterDiagnostics: workbookInterpreterDebugSummary(
            interpreted.diagnostics
          ),
          workbookExtractionMode: "LEGACY_PLAN",
        },
      };
    }

    if (
      interpreted.status !== "SUCCESS" ||
      !interpreted.plan ||
      !interpreted.execution
    ) {
      return {
        documentId: descriptor.documentId,
        sourceType: descriptor.sourceType,
        fileName: descriptor.fileName,
        rows: [],
        unresolvedItems: [],
        warnings: [...warnings, "WORKBOOK_INTERPRETER_FAILED"],
        status: "FAILED" as const,
        errorCode: "WORKBOOK_INTERPRETER_FAILED",
        usage: emptyUsage,
        durationMs: Date.now() - started,
        workbookEvidence: {
          parserKind: snapshot.parserKind,
          snapshot,
          mapping: null,
          coverage: null,
          rawPartRows: [],
          excludedTotalSubtotalRows: [],
          unknownRows: [],
          hiddenPartRowsRequiringReview: [],
          workbookInterpreterDiagnostics: workbookInterpreterDebugSummary(
            interpreted.diagnostics
          ),
          workbookExtractionMode: "LEGACY_PLAN",
        },
      };
    }

    const mapping = planToSyntheticMapping(interpreted.plan);
    const coverage = interpreted.execution.coverage;
    return finalizeWorkbookSuccess({
      descriptor,
      started,
      warnings,
      snapshot,
      mapping,
      partRows: interpreted.partRows,
      registry: args.registry,
      coverage: {
        sourceNonEmptyRowCount: coverage.declaredDataRows,
        accountedNonEmptyRowCount: coverage.classifiedRows,
        mappedPartRowCount: coverage.dataOccurrences,
        mappedHeaderRowCount: interpreted.execution.skippedRows.filter(
          (s) =>
            s.classification === "HEADER" ||
            s.classification === "REPEATED_HEADER"
        ).length,
        mappedSubtotalRowCount: interpreted.execution.skippedRows.filter(
          (s) => s.classification === "SUBTOTAL"
        ).length,
        mappedTotalRowCount: interpreted.execution.skippedRows.filter(
          (s) => s.classification === "TOTAL"
        ).length,
        mappedNoteRowCount: interpreted.execution.skippedRows.filter(
          (s) => s.classification === "NOTE"
        ).length,
        mappedEmptyRowCount: interpreted.execution.skippedRows.filter(
          (s) => s.classification === "BLANK"
        ).length,
        unknownNonEmptyRowCount: coverage.unexplainedRows,
        unaccountedNonEmptyRowCount: coverage.unexplainedRows,
        coverageComplete: coverage.unexplainedRows === 0,
        issues: [],
        missingRowKeys: [],
        nonEmptyRowCount: coverage.declaredDataRows,
        mappedRowCount: coverage.classifiedRows,
        unknownRowCount: coverage.unexplainedRows,
      },
      excludedTotalSubtotalRows: interpreted.skippedExcludedRows,
      workbookInterpreterDiagnostics: workbookInterpreterDebugSummary(
        interpreted.diagnostics
      ),
      workbookExtractionMode: "LEGACY_PLAN",
      emptyUsage,
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "WORKBOOK_INTERPRETER_FAILED";
    console.error(
      `[ai-intake] workbook interpreter failed ${descriptor.fileName}`,
      err
    );
    return {
      documentId: descriptor.documentId,
      sourceType: descriptor.sourceType,
      fileName: descriptor.fileName,
      rows: [],
      unresolvedItems: [],
      warnings: [
        ...warnings,
        `SOURCE_EXTRACTION_FAILED:${descriptor.fileName}:${code}`,
      ],
      status: "FAILED",
      errorCode: code,
      usage: emptyUsage,
      durationMs: Date.now() - started,
      workbookEvidence: {
        parserKind: snapshot.parserKind,
        snapshot,
        mapping: null,
        coverage: null,
        rawPartRows: [],
        excludedTotalSubtotalRows: [],
        unknownRows: [],
        hiddenPartRowsRequiringReview: [],
        workbookExtractionMode: "LEGACY_PLAN",
      },
    };
  }
}

export async function extractEmailFactsWithOpenAI(args: {
  client: OpenAI;
  model: string;
  sender: string;
  subject: string;
  body: string;
  registry: SlimRegistryItem[];
}): Promise<{
  emailFacts: ExtractedEmailFact[];
  unresolvedItems: UnresolvedRequestItem[];
  warnings: string[];
  usage: TokenUsage;
  durationMs: number;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  errorCode: string | null;
}> {
  if (!args.body.trim()) {
    return {
      emailFacts: [],
      unresolvedItems: [],
      warnings: [],
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      durationMs: 0,
      status: "SKIPPED",
      errorCode: null,
    };
  }

  const started = Date.now();
  try {
    const registryJson = JSON.stringify(args.registry, null, 2);
    const userText = [
      `Sender: ${args.sender || "(empty)"}`,
      `Subject: ${args.subject || "(empty)"}`,
      "",
      "Email body:",
      args.body,
      "",
      "DXF_PART_REGISTRY (canonicalPartId only — map only to these IDs):",
      registryJson,
      "",
      "No XLSX/PDF attachments are included. Extract email facts only.",
    ].join("\n");

    const response = await args.client.responses.parse({
      model: args.model,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: EMAIL_SYSTEM_INSTRUCTIONS },
        { role: "user", content: userText },
      ],
      text: {
        format: zodTextFormat(emailExtractionSchema, "email_extraction"),
      },
    });

    const durationMs = Date.now() - started;
    const parsed = response.output_parsed;
    if (!parsed) {
      throw Object.assign(new Error("OPENAI_SCHEMA"), { code: "OPENAI_SCHEMA" });
    }
    const modelResult = emailExtractionSchema.parse(parsed);
    const ids = new Set(args.registry.map((r) => r.canonicalPartId));
    const warnings = [...modelResult.warnings];

    const normalized = normalizeEmailFacts(modelResult.emailFacts);
    const emailFacts = normalized.map((fact, index) => {
      if (fact.matchedDxfPartId != null && !ids.has(fact.matchedDxfPartId)) {
        warnings.push(
          `Rejected unknown matchedDxfPartId "${fact.matchedDxfPartId}" on email fact ${index}`
        );
        return { ...fact, matchedDxfPartId: null };
      }
      return fact;
    });

    // Soft warning if only one quantity fact but body mentions multiple quantities for same part
    const qtyFacts = emailFacts.filter(
      (f) => f.field === "QUANTITY" && f.matchedDxfPartId
    );
    if (qtyFacts.length === 1 && /\d+/.test(args.body)) {
      const partId = qtyFacts[0]!.matchedDxfPartId!;
      const qtyMentions = [
        ...args.body.matchAll(
          new RegExp(
            `${partId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\d]{0,40}?(\\d+)`,
            "gi"
          )
        ),
      ];
      const distinctMentions = new Set(
        qtyMentions.map((m) => m[1]).filter(Boolean)
      );
      if (distinctMentions.size > 1 && qtyFacts.length < distinctMentions.size) {
        warnings.push(
          `EMAIL_POSSIBLY_COLLAPSED_STATEMENTS:part=${partId}:mentions=${[...distinctMentions].join(",")}:facts=${qtyFacts.length}`
        );
      }
    }

    const unresolvedItems: UnresolvedRequestItem[] =
      modelResult.unresolvedItems.map((item) => ({
        rawPartReference: item.rawPartReference,
        description: item.description,
        possibleDxfPartIds: item.possibleDxfPartIds.filter((id) => ids.has(id)),
        reason: item.reason,
        source: {
          type: "EMAIL" as const,
          fileName: null,
          sheetName: null,
          rowNumber: null,
          cellReferences: [],
          pageNumber: null,
          excerpt: item.sourceExcerpt,
        },
      }));

    return {
      emailFacts,
      unresolvedItems,
      warnings,
      usage: usageFromResponse(response.usage),
      durationMs,
      status: "SUCCESS" as const,
      errorCode: null,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "OPENAI_FAILED";
    console.error("[ai-intake] email extraction failed", err);
    return {
      emailFacts: [],
      unresolvedItems: [],
      warnings: [`EMAIL_EXTRACTION_FAILED:${code}`],
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      durationMs: Date.now() - started,
      status: "FAILED",
      errorCode: code,
    };
  }
}

const DEFAULT_CONCURRENCY = 3;

export type IsolatedExtractionResult = {
  extraction: AiRequestExtraction;
  aggregated: AggregatedSourceExtraction;
  model: string;
  durationMs: number;
  usage: TokenUsage;
  openaiCallCount: number;
  partial: boolean;
  perSourceUsage: Array<{
    label: string;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    durationMs: number;
    status: string;
  }>;
};

/**
 * Checkpoint 4.1 — source-isolated extraction.
 * One OpenAI call per XLSX/PDF; optional separate email call; aggregate after all finish.
 */
export async function extractIsolatedSourcesWithOpenAI(args: {
  sender: string;
  subject: string;
  body: string;
  registry: SlimRegistryItem[];
  documents: DocumentFileInput[];
  concurrency?: number;
}): Promise<IsolatedExtractionResult> {
  const { client, model } = getClientAndModel();
  const concurrency = args.concurrency ?? DEFAULT_CONCURRENCY;
  const started = Date.now();

  const runEmailEligibility = classifySourceForProviderExtraction({
    kind: "EMAIL",
    subject: args.subject,
    body: args.body,
    attachmentIds: args.documents.map((d) => d.documentId),
    alreadyHandledAttachmentIds: args.documents.map((d) => d.documentId),
  });
  const runEmail = runEmailEligibility.eligible && Boolean(args.body.trim());

  const [documentResults, emailResult] = await Promise.all([
    mapPool(args.documents, concurrency, (doc) =>
      extractSingleDocumentWithOpenAI({
        client,
        model,
        document: doc,
        registry: args.registry,
      })
    ),
    runEmail
      ? extractEmailFactsWithOpenAI({
          client,
          model,
          sender: args.sender,
          subject: args.subject,
          body: args.body,
          registry: args.registry,
        })
      : Promise.resolve({
          emailFacts: [] as ExtractedEmailFact[],
          unresolvedItems: [] as UnresolvedRequestItem[],
          warnings: [
            ...(runEmailEligibility.eligible
              ? []
              : [
                  `EMAIL_PROVIDER_SKIPPED:${runEmailEligibility.reason}`,
                ]),
          ] as string[],
          usage: {
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
          } as TokenUsage,
          durationMs: 0,
          status: "SKIPPED" as const,
          errorCode: null as string | null,
        }),
  ]);

  // Source-completeness: every uploaded document must have a result entry
  if (documentResults.length !== args.documents.length) {
    throw Object.assign(new Error("SOURCE_COMPLETENESS"), {
      code: "SOURCE_COMPLETENESS",
    });
  }
  for (const doc of args.documents) {
    const found = documentResults.find((r) => r.documentId === doc.documentId);
    if (!found) {
      throw Object.assign(new Error("SOURCE_COMPLETENESS"), {
        code: "SOURCE_COMPLETENESS",
      });
    }
    if (
      (found.status === "SUCCESS" || found.status === "PARTIAL") &&
      (found.documentId !== doc.documentId ||
        found.fileName !== doc.filename ||
        found.sourceType !== doc.sourceType)
    ) {
      throw Object.assign(new Error("SOURCE_METADATA_MISMATCH"), {
        code: "SOURCE_METADATA_MISMATCH",
      });
    }
  }

  const successfulRows = documentResults
    .filter((d) => d.status === "SUCCESS" || d.status === "PARTIAL")
    .flatMap((d) => d.rows);

  const unresolvedItems: UnresolvedRequestItem[] = [
    ...documentResults.flatMap((d) => d.unresolvedItems),
    ...emailResult.unresolvedItems,
  ];

  const warnings = [
    ...documentResults.flatMap((d) => d.warnings),
    ...emailResult.warnings,
  ];

  const extraction: AiRequestExtraction = {
    documentRows: successfulRows,
    emailFacts: emailResult.emailFacts,
    unresolvedItems,
    warnings,
  };

  const expandedFacts = expandExtractionToFacts(extraction);

  const anyDocFailed = documentResults.some((d) => d.status === "FAILED");
  const anyDocPartial = documentResults.some((d) => d.status === "PARTIAL");
  const emailFailed = emailResult.status === "FAILED";
  const partial = anyDocFailed || anyDocPartial || emailFailed;

  const openaiCallCount =
    args.documents.length + (runEmail ? 1 : 0);

  const perSourceUsage = [
    ...documentResults.map((d) => ({
      label: `${d.sourceType}:${d.fileName}`,
      inputTokens: d.usage.inputTokens,
      outputTokens: d.usage.outputTokens,
      totalTokens: d.usage.totalTokens,
      durationMs: d.durationMs,
      status: d.status,
    })),
    ...(runEmail
      ? [
          {
            label: "EMAIL",
            inputTokens: emailResult.usage.inputTokens,
            outputTokens: emailResult.usage.outputTokens,
            totalTokens: emailResult.usage.totalTokens,
            durationMs: emailResult.durationMs,
            status: emailResult.status,
          },
        ]
      : []),
  ];

  const usage = sumUsage(perSourceUsage.map((p) => ({
    inputTokens: p.inputTokens,
    outputTokens: p.outputTokens,
    totalTokens: p.totalTokens,
  })));

  const aggregated: AggregatedSourceExtraction = {
    documents: documentResults,
    emailFacts: emailResult.emailFacts,
    expandedFacts,
    emailUsage: runEmail ? emailResult.usage : null,
    emailDurationMs: runEmail ? emailResult.durationMs : null,
    openaiCallCount,
    partial,
  };

  return {
    extraction,
    aggregated,
    model,
    durationMs: Date.now() - started,
    usage,
    openaiCallCount,
    partial,
    perSourceUsage,
  };
}

/** @deprecated Prefer extractIsolatedSourcesWithOpenAI */
export async function extractRequestFactsWithOpenAI(args: {
  sender: string;
  subject: string;
  body: string;
  registry: SlimRegistryItem[];
  documents: DocumentFileInput[];
}): Promise<IsolatedExtractionResult> {
  return extractIsolatedSourcesWithOpenAI(args);
}

export { mimeForFilename };
