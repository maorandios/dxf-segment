/**
 * AI Intake Lab debug report — canonical JSON exporter tests.
 * Run: npx tsx lib/ai-intake/__tests__/debug-report.ts
 */
import {
  buildAiIntakeDebugReport,
  copyTextToClipboard,
  fallbackCopyTextToClipboard,
  serializeAiIntakeDebugReport,
  AI_INTAKE_DEBUG_REPORT_SCHEMA_VERSION,
} from "../debug";
import {
  normalizeWorkbookPartRows,
  type AiWorkbookMappingResult,
  type RawDocumentPartRow,
  type RawMeasurement,
} from "../normalization";
import { buildOccurrenceId } from "../requestOccurrences";
import { emptyDocumentGeometry } from "../schemas";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  ExtractedRequestFact,
  FinalIntakeMappingRow,
  WorkbookEvidenceDebug,
} from "../schemas";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
    );
  }
}

function rawMeas(
  partial: Partial<RawMeasurement> & { rawValue: number | string | null }
): RawMeasurement {
  return {
    rawValue: partial.rawValue,
    rawText:
      partial.rawText ??
      (partial.rawValue != null ? String(partial.rawValue) : null),
    statedUnit: partial.statedUnit ?? null,
    rawHeader: partial.rawHeader ?? null,
    displayedDecimalPlaces: partial.displayedDecimalPlaces ?? null,
    sourceCell: partial.sourceCell ?? null,
    numberFormat: partial.numberFormat ?? null,
    formula: partial.formula ?? null,
    formulaResult: partial.formulaResult ?? null,
    origin: partial.origin ?? "DETERMINISTIC_WORKBOOK_CELL",
  };
}

function partRow(args: {
  id: string;
  part: string;
  row: number;
  thickness?: RawMeasurement | null;
  width?: RawMeasurement | null;
  height?: RawMeasurement | null;
  area?: RawMeasurement | null;
  unitWeight?: RawMeasurement | null;
  qty?: number;
}): RawDocumentPartRow {
  return {
    occurrenceId: args.id,
    documentId: "doc:xls:1",
    rowRole: "PART",
    matchedDxfPartId: args.part,
    rawPartReference: args.part,
    partReferenceCell: `B${args.row}`,
    materialCell: null,
    quantity: rawMeas({ rawValue: args.qty ?? 1, sourceCell: `A${args.row}` }),
    thickness: args.thickness ?? null,
    material: "S235",
    width: args.width ?? null,
    height: args.height ?? null,
    area: args.area ?? null,
    totalArea: null,
    unitWeight: args.unitWeight ?? null,
    totalWeight: null,
    description: null,
    notes: null,
    source: {
      type: "XLSX",
      fileName: "real.xls",
      sheetName: "Sheet1",
      rowNumber: args.row,
      pageNumber: null,
      excerpt: null,
      tableId: "t1",
    },
    extractionIssues: [],
    isHiddenRow: false,
  };
}

function realLikeMapping(): AiWorkbookMappingResult {
  return {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: "A6:J22",
            headerRowNumbers: [6],
            firstDataRow: 7,
            lastDataRow: 22,
            columns: {
              partReference: "B",
              quantity: "A",
              thickness: "C",
              material: null,
              width: "E",
              height: "F",
              area: "G",
              totalArea: "H",
              unitWeight: "I",
              totalWeight: "J",
            },
            columnHeaders: [
              {
                columnLetter: "C",
                rawHeaderText: "Plate THK",
                detectedMeaning: "thickness",
                statedUnitText: null,
                headerCellReferences: ["C6"],
              },
              {
                columnLetter: "F",
                rawHeaderText: "Length(m)",
                detectedMeaning: "height/length",
                statedUnitText: "m",
                headerCellReferences: ["F6"],
              },
            ],
            rowRoles: [
              { rowNumber: 6, role: "HEADER", reason: "header" },
              { rowNumber: 16, role: "PART", reason: "part" },
              { rowNumber: 17, role: "PART", reason: "part" },
            ],
            warnings: [],
          },
        ],
        unmappedNonEmptyRows: [],
        metadataRowNumbers: [1, 2, 3, 4, 5],
      },
    ],
  };
}

function buildRealLikeRows(): RawDocumentPartRow[] {
  const dim = (
    part: string,
    row: number,
    thk: number | null,
    w: number,
    h: number,
    area: number,
    uw: number
  ) =>
    partRow({
      id: `${part}:r${row}`,
      part,
      row,
      thickness:
        thk == null
          ? rawMeas({
              rawValue: null,
              rawHeader: "Plate THK",
              sourceCell: `C${row}`,
            })
          : rawMeas({
              rawValue: thk,
              rawHeader: "Plate THK",
              sourceCell: `C${row}`,
            }),
      width: rawMeas({
        rawValue: w,
        statedUnit: "MM",
        rawHeader: "Width(mm)",
        sourceCell: `E${row}`,
      }),
      height: rawMeas({
        rawValue: h,
        statedUnit: "M",
        rawHeader: "Length(m)",
        sourceCell: `F${row}`,
      }),
      area: rawMeas({
        rawValue: area,
        statedUnit: "M2",
        rawHeader: "Area (m2)",
        sourceCell: `G${row}`,
        displayedDecimalPlaces: 2,
      }),
      unitWeight: rawMeas({
        rawValue: uw,
        statedUnit: "KG",
        rawHeader: "Wieght (kg)",
        sourceCell: `I${row}`,
        displayedDecimalPlaces: 1,
      }),
    });

  return [
    dim("P1091", 7, 12, 1000, 1000, 0.04, 3.3),
    dim("P1097", 11, 16, 264, 264, 0.07, 8.8),
    dim("P1098", 10, null, 155, 500, 0.08, 6.1),
    dim("P1096", 14, 20, 300, 300, 0.09, 14.1),
    dim("P1093", 15, 20, 280, 580, 0.16, 25.1),
    dim("P1095", 16, 20, 600, 600, 0.36, 56.5),
    dim("P1095", 17, 20, 600, 600, 0.36, 56.5),
    dim("P1092", 18, 20, 600, 600, 0.36, 56.5),
    dim("P1084", 19, 20, 720, 720, 0.52, 81.4),
    dim("P1094", 22, 30, 80, 580, 0.05, 10.9),
  ];
}

function registry() {
  return [
    {
      canonicalPartId: "P1091",
      revision: null,
      filename: "P1091.dxf",
      widthMm: 250,
      heightMm: 140,
      plateAreaMm2: 35000,
    },
    {
      canonicalPartId: "P1097",
      revision: null,
      filename: "P1097.dxf",
      widthMm: 264,
      heightMm: 264,
      plateAreaMm2: 69696,
    },
    {
      canonicalPartId: "P1098",
      revision: null,
      filename: "P1098.dxf",
      widthMm: 155,
      heightMm: 500,
      plateAreaMm2: 77500,
    },
    {
      canonicalPartId: "P1096",
      revision: null,
      filename: "P1096.dxf",
      widthMm: 300,
      heightMm: 300,
      plateAreaMm2: 90000,
    },
    {
      canonicalPartId: "P1093",
      revision: null,
      filename: "P1093.dxf",
      widthMm: 280,
      heightMm: 580,
      plateAreaMm2: 162400,
    },
    {
      canonicalPartId: "P1095",
      revision: null,
      filename: "P1095.dxf",
      widthMm: 600,
      heightMm: 600,
      plateAreaMm2: 360000,
    },
    {
      canonicalPartId: "P1092",
      revision: null,
      filename: "P1092.dxf",
      widthMm: 600,
      heightMm: 600,
      plateAreaMm2: 360000,
    },
    {
      canonicalPartId: "P1084",
      revision: null,
      filename: "P1084.dxf",
      widthMm: 720,
      heightMm: 720,
      plateAreaMm2: 518400,
    },
    {
      canonicalPartId: "P1094",
      revision: null,
      filename: "P1094.dxf",
      widthMm: 80,
      heightMm: 580,
      plateAreaMm2: 46400,
    },
  ];
}

function rawToExtracted(row: RawDocumentPartRow): ExtractedDocumentRow {
  const th = row.thickness;
  return {
    documentId: row.documentId,
    matchedDxfPartId: row.matchedDxfPartId,
    rawPartReference: row.rawPartReference,
    quantity:
      typeof row.quantity?.rawValue === "number" ? row.quantity.rawValue : null,
    thicknessMm:
      typeof th?.rawValue === "number" ? (th.rawValue as number) : null,
    material: row.material,
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: {
      ...emptyDocumentGeometry(),
      width:
        typeof row.width?.rawValue === "number"
          ? (row.width.rawValue as number)
          : null,
      widthUnit: "MM",
      height:
        typeof row.height?.rawValue === "number"
          ? (row.height.rawValue as number)
          : null,
      heightUnit: "MM",
      area:
        typeof row.area?.rawValue === "number"
          ? (row.area.rawValue as number)
          : null,
      areaUnit: "M2",
    },
    source: {
      type: "XLSX",
      fileName: row.source.fileName,
      sheetName: row.source.sheetName,
      rowNumber: row.source.rowNumber,
      pageNumber: null,
      partReferenceCell: row.partReferenceCell,
      quantityCell: row.quantity?.sourceCell ?? null,
      thicknessCell: row.thickness?.sourceCell ?? null,
      materialCell: null,
      excerpt: `${row.rawPartReference}`,
    },
    issues: [],
  };
}

function emptyFinalRow(
  partial: Partial<FinalIntakeMappingRow> & { partId: string }
): FinalIntakeMappingRow {
  const base: FinalIntakeMappingRow = {
    status: "READY",
    partId: partial.partId,
    displayLabel: null,
    revision: null,
    dxfFileId: null,
    dxfFilename: `${partial.partId}.dxf`,
    widthMm: null,
    heightMm: null,
    plateAreaMm2: null,
    netContourAreaMm2: null,
    perimeterMm: null,
    quantity: 1,
    thicknessMm: null,
    material: "S235",
    description: null,
    action: "INCLUDE",
    fieldSources: {
      quantity: "XLSX",
      thickness: "XLSX",
      material: "XLSX",
    },
    fieldCandidates: { quantity: [], thickness: [], material: [] },
    fieldResolutions: {
      quantity: {
        value: 1,
        resolutionStatus: "SINGLE_SOURCE",
        candidates: [],
      },
      thickness: {
        value: null,
        resolutionStatus: "MISSING",
        candidates: [],
      },
      material: {
        value: "S235",
        resolutionStatus: "SINGLE_SOURCE",
        candidates: [],
      },
    },
    previousValues: [],
    hasDocumentSource: true,
    hasEmailSource: false,
    hasDocumentAndEmail: false,
    contributingFacts: [],
    sourceEvidence: [],
    issues: [],
    requestOccurrences: [],
    occurrenceCount: 1,
    duplicateOccurrenceCount: 0,
    duplicateStatus: "NONE",
    ignoredOccurrences: [],
    duplicateIssues: [],
    geometryComparisons: [],
    geometryComparisonStatus: "NOT_AVAILABLE",
  };
  return { ...base, ...partial };
}

function buildFixtureSuccess(): AiIntakeAnalyzeSuccess {
  const mapping = realLikeMapping();
  const rows = buildRealLikeRows();
  const normalized = normalizeWorkbookPartRows({
    documentId: "doc:xls:1",
    mapping,
    partRows: rows,
    registry: registry(),
  });

  const workbookEvidence: WorkbookEvidenceDebug = {
    parserKind: "SHEETJS_XLS",
    snapshot: {
      documentId: "doc:xls:1",
      fileName: "real.xls",
      parserKind: "SHEETJS_XLS",
      sheets: [
        {
          sheetName: "Sheet1",
          usedRange: "A1:J22",
          mergedRanges: [],
          hidden: false,
          cells: rows.flatMap((r) => [
            {
              sheetName: "Sheet1",
              cellAddress: `B${r.source.rowNumber}`,
              rawValue: r.rawPartReference,
              formattedText: r.rawPartReference,
              formula: null,
              formulaResult: null,
              numberFormat: "General",
              rowNumber: r.source.rowNumber,
              columnLetter: "B",
              isMerged: false,
              mergedRange: null,
              isHiddenRow: false,
              isHiddenColumn: false,
            },
            {
              sheetName: "Sheet1",
              cellAddress: `C${r.source.rowNumber}`,
              rawValue: r.thickness?.rawValue ?? null,
              formattedText:
                r.thickness?.rawValue != null
                  ? String(r.thickness.rawValue)
                  : null,
              formula: null,
              formulaResult: null,
              numberFormat: "General",
              rowNumber: r.source.rowNumber,
              columnLetter: "C",
              isMerged: false,
              mergedRange: null,
              isHiddenRow: false,
              isHiddenColumn: false,
            },
          ]),
        },
      ],
      warnings: [],
    },
    mapping,
    coverage: {
      sourceNonEmptyRowCount: 16,
      accountedNonEmptyRowCount: 16,
      mappedPartRowCount: 10,
      mappedHeaderRowCount: 1,
      mappedSubtotalRowCount: 0,
      mappedTotalRowCount: 0,
      mappedNoteRowCount: 5,
      mappedEmptyRowCount: 0,
      unknownNonEmptyRowCount: 0,
      unaccountedNonEmptyRowCount: 0,
      coverageComplete: true,
      issues: [],
      missingRowKeys: [],
    },
    rawPartRows: rows,
    excludedTotalSubtotalRows: [],
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
  };

  const extractedRows = rows.map(rawToExtracted);
  // Apply normalized thickness for P1098 null preservation in final rows
  const p1098Norm = normalized.normalizedRows.find(
    (n) => n.raw.matchedDxfPartId === "P1098"
  );
  for (const er of extractedRows) {
    if (er.rawPartReference === "P1098") {
      er.thicknessMm = p1098Norm?.thickness?.normalizedValue ?? null;
    } else {
      const nm = normalized.normalizedRows.find(
        (n) =>
          n.raw.source.rowNumber === er.source.rowNumber &&
          n.raw.matchedDxfPartId === er.matchedDxfPartId
      );
      if (nm?.thickness?.normalizedValue != null) {
        er.thicknessMm = nm.thickness.normalizedValue;
      }
    }
  }

  const pdfRow: ExtractedDocumentRow = {
    documentId: "doc:pdf:1",
    matchedDxfPartId: "P1095",
    rawPartReference: "P1095",
    quantity: 2,
    thicknessMm: 20,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: {
      ...emptyDocumentGeometry(),
      area: 0.36,
      areaUnit: "M2",
    },
    source: {
      type: "PDF",
      fileName: "quote.pdf",
      sheetName: null,
      rowNumber: null,
      pageNumber: 2,
      partReferenceCell: null,
      quantityCell: null,
      thicknessCell: null,
      materialCell: null,
      excerpt: "P1095 qty 2 thickness 20mm",
    },
    issues: [],
  };

  const emailFact: ExtractedRequestFact = {
    field: "QUANTITY",
    value: 5,
    matchedDxfPartId: "P1092",
    rawPartReference: "P1092",
    instructionType: "OVERRIDE",
    explicitlySupersedesPrevious: true,
    statementIndex: 1,
    emailFactId: "ef:1",
    source: {
      type: "EMAIL",
      fileName: null,
      sheetName: null,
      rowNumber: null,
      pageNumber: null,
      cellReferences: [],
      excerpt: "עבור P1092 הכמות היא 5",
    },
    issues: [],
  };

  const finalRows: FinalIntakeMappingRow[] = [
    emptyFinalRow({
      partId: "P1091",
      quantity: 1,
      thicknessMm: 12,
      widthMm: 1000,
      heightMm: 1000,
      plateAreaMm2: 35000,
    }),
    emptyFinalRow({
      partId: "P1095",
      quantity: 2,
      thicknessMm: 20,
      widthMm: 600,
      heightMm: 600,
      plateAreaMm2: 360000,
      status: "NEEDS_REVIEW",
      issues: ["IDENTICAL_DUPLICATE_OCCURRENCES"],
    }),
    emptyFinalRow({
      partId: "P1098",
      quantity: 1,
      thicknessMm: null,
      widthMm: 155,
      heightMm: 500,
      plateAreaMm2: 77500,
    }),
    emptyFinalRow({
      partId: "P1092",
      quantity: 5,
      thicknessMm: 20,
      hasEmailSource: true,
      hasDocumentAndEmail: true,
      fieldSources: {
        quantity: "EMAIL_OVERRIDE",
        thickness: "XLSX",
        material: "XLSX",
      },
      contributingFacts: [emailFact],
      previousValues: [{ field: "QUANTITY", value: 4, source: "XLSX" }],
    }),
  ];

  return {
    ok: true,
    extraction: {
      documentRows: [...extractedRows, pdfRow],
      emailFacts: [
        {
          factId: "ef:1",
          statementIndex: 1,
          matchedDxfPartId: "P1092",
          rawPartReference: "P1092",
          field: "QUANTITY",
          value: 5,
          instructionType: "OVERRIDE",
          explicitlySupersedesPrevious: true,
          sourceExcerpt: "עבור P1092 הכמות היא 5",
        },
      ],
      unresolvedItems: [],
      warnings: [],
    },
    acceptedFacts: [
      ...extractedRows.flatMap((r): ExtractedRequestFact[] => [
        {
          field: "QUANTITY",
          value: r.quantity,
          matchedDxfPartId: r.matchedDxfPartId,
          rawPartReference: r.rawPartReference,
          instructionType: "VALUE",
          statementIndex: null,
          source: {
            type: "XLSX",
            fileName: r.source.fileName,
            sheetName: r.source.sheetName,
            rowNumber: r.source.rowNumber,
            pageNumber: null,
            cellReferences: r.source.quantityCell
              ? [r.source.quantityCell]
              : [],
            excerpt: r.source.excerpt,
          },
          issues: [],
        },
        {
          field: "THICKNESS",
          value: r.thicknessMm,
          matchedDxfPartId: r.matchedDxfPartId,
          rawPartReference: r.rawPartReference,
          instructionType: "VALUE",
          statementIndex: null,
          source: {
            type: "XLSX",
            fileName: r.source.fileName,
            sheetName: r.source.sheetName,
            rowNumber: r.source.rowNumber,
            pageNumber: null,
            cellReferences: r.source.thicknessCell
              ? [r.source.thicknessCell]
              : [],
            excerpt: r.source.excerpt,
          },
          issues: [],
        },
      ]),
      emailFact,
    ],
    aggregated: {
      documents: [
        {
          documentId: "doc:xls:1",
          sourceType: "XLSX",
          fileName: "real.xls",
          rows: extractedRows,
          unresolvedItems: [],
          warnings: [],
          status: "SUCCESS",
          errorCode: null,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          durationMs: 1200,
          workbookEvidence,
        },
        {
          documentId: "doc:pdf:1",
          sourceType: "PDF",
          fileName: "quote.pdf",
          rows: [pdfRow],
          unresolvedItems: [],
          warnings: [],
          status: "SUCCESS",
          errorCode: null,
          usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
          durationMs: 900,
          workbookEvidence: null,
        },
      ],
      emailFacts: [],
      expandedFacts: [],
      emailUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      emailDurationMs: 400,
      openaiCallCount: 3,
      partial: false,
    },
    auditRows: extractedRows.map((r) => ({
      status: "MATCHED" as const,
      rawPartReference: r.rawPartReference,
      matchedDxfPartId: r.matchedDxfPartId,
      sourceType: "XLSX" as const,
      sourceLabel: `XLSX · real.xls · Sheet1 · row ${r.source.rowNumber}`,
      extractedQuantity: r.quantity,
      extractedThicknessMm: r.thicknessMm,
      extractedMaterial: r.material,
      reason: null,
      documentId: r.documentId,
      hasDocumentAndEmail: false,
    })),
    auditSummary: {
      customerPartsSeen: 10,
      matchedCount: 10,
      requestWithoutDxfCount: 0,
      dxfNotReferencedCount: 0,
      requiresReviewCount: 0,
      failedSourceCount: 0,
    },
    finalRows,
    warnings: [],
    partial: false,
    debug: {
      model: "gpt-test",
      durationMs: 2500,
      openaiCallCount: 3,
      usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      perSourceUsage: [
        {
          label: "real.xls",
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          durationMs: 1200,
          status: "SUCCESS",
        },
        {
          label: "quote.pdf",
          inputTokens: 80,
          outputTokens: 40,
          totalTokens: 120,
          durationMs: 900,
          status: "SUCCESS",
        },
        {
          label: "email",
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
          durationMs: 400,
          status: "SUCCESS",
        },
      ],
    },
  };
}

async function main() {
  console.log("\n=== Test 1 — valid canonical JSON ===");
  const success = buildFixtureSuccess();
  const report = buildAiIntakeDebugReport(success, {
    generatedAt: "2026-07-17T05:00:00.000Z",
    dxfParts: registry().map((r) => ({
      partId: r.canonicalPartId,
      fileName: r.filename,
      bboxWidthMm: r.widthMm ?? null,
      bboxHeightMm: r.heightMm ?? null,
      plateAreaMm2: r.plateAreaMm2 ?? null,
      netContourAreaMm2: null,
      geometryStatus: "VALID",
    })),
    emails: [
      {
        emailId: null,
        subject: "הצעת מחיר",
        bodyText: "עבור P1092 הכמות היא 5",
        sourceLabel: "simulated-email",
      },
    ],
  });
  const json = serializeAiIntakeDebugReport(report);
  const parsed = JSON.parse(json);
  assertEq(parsed.schemaVersion, AI_INTAKE_DEBUG_REPORT_SCHEMA_VERSION, "schema");
  assert(json.trimStart().startsWith("{"), "starts with {");
  assert(!json.includes("```"), "no markdown fences");
  console.log("PASS");

  console.log("\n=== Test 2 — real workbook sections ===");
  const xls = report.documents.find((d) => d.documentId === "doc:xls:1")!;
  assertEq(xls.parserKind, "SHEETJS_XLS", "parserKind");
  const coverage = xls.coverage as Record<string, unknown>;
  assertEq(coverage.coverageComplete, true, "coverageComplete");
  assertEq(coverage.mappedPartRowCount, 10, "mappedPartRowCount");
  const profiles = xls.columnUnitProfiles as Array<Record<string, unknown>>;
  const cProf = profiles.find((p) => p.semanticField === "THICKNESS")!;
  const fProf = profiles.find((p) => p.semanticField === "HEIGHT")!;
  assertEq(cProf.resolvedUnit, "MM", "C MM");
  assertEq(fProf.statedHeaderUnit, "M", "F stated M");
  assertEq(fProf.resolvedUnit, "MM", "F resolved MM");
  assert(xls.normalizedMeasurements.length === 10, "normalized rows");
  assert(xls.precisionComparisons.length > 0, "precision comparisons");
  console.log("PASS");

  console.log("\n=== Test 3 — duplicate occurrence preservation ===");
  const recon = xls.reconstructedRows as Array<Record<string, unknown>>;
  const norm = xls.normalizedMeasurements as Array<Record<string, unknown>>;
  const p1095Recon = recon.filter((r) => r.rawPartReference === "P1095");
  const p1095Norm = norm.filter((r) => r.partId === "P1095");
  assertEq(p1095Recon.length, 2, "recon P1095 x2");
  assertEq(p1095Norm.length, 2, "norm P1095 x2");
  assert(
    p1095Recon.some((r) => r.source && (r.source as { rowNumber: number }).rowNumber === 16),
    "row 16"
  );
  assert(
    p1095Recon.some((r) => r.source && (r.source as { rowNumber: number }).rowNumber === 17),
    "row 17"
  );
  const matchP1095 = report.matching.rows.filter(
    (r) => r.rawPartReference === "P1095" && r.sourceType === "XLSX"
  );
  assert(matchP1095.length >= 2, `matching P1095 got ${matchP1095.length}`);
  console.log("PASS");

  console.log("\n=== Test 4 — missing value preservation ===");
  const p1098 = norm.find((r) => r.partId === "P1098") as Record<
    string,
    unknown
  >;
  const th = p1098.thickness as Record<string, unknown>;
  const raw = th.raw as Record<string, unknown>;
  assertEq(raw.rawValue, null, "rawValue null");
  assertEq(th.resolutionStatus, "NOT_PRESENT", "NOT_PRESENT");
  assertEq(th.normalizedValue, null, "normalized null");
  const out1098 = report.output.parts.find((p) => p.partId === "P1098")!;
  assertEq(out1098.thicknessMm, null, "final thickness null");
  console.log("PASS");

  console.log("\n=== Test 5 — PDF support ===");
  const pdf = report.documents.find((d) => d.documentId === "doc:pdf:1")!;
  assertEq(pdf.originHint, "AI_EXTRACTED_PDF", "origin");
  assert(pdf.pageEvidence != null, "page evidence");
  assert(pdf.extractedRows.length === 1, "pdf extracted");
  const pageEv = pdf.pageEvidence as { pages: Array<{ pageNumber: number }> };
  assertEq(pageEv.pages[0]!.pageNumber, 2, "page 2");
  console.log("PASS");

  console.log("\n=== Test 6 — email support ===");
  assertEq(report.inputs.emails.length, 1, "email input");
  assert(
    report.inputs.emails[0]!.bodyText.includes("P1092"),
    "body text"
  );
  const emailFacts = report.facts.items.filter(
    (f) => f.source.type === "EMAIL"
  );
  assert(emailFacts.length >= 1, "email facts");
  assertEq(emailFacts[0]!.statementIndex, 1, "statementIndex");
  assertEq(emailFacts[0]!.explicitlySupersedesPrevious, true, "override");
  console.log("PASS");

  console.log("\n=== Test 7 — no binary or secrets ===");
  assert(!json.includes("ArrayBuffer"), "no ArrayBuffer");
  assert(!json.includes("data:application"), "no data uri");
  assert(!/sk-[a-zA-Z0-9]{10,}/.test(json), "no api key pattern");
  assert(!json.toLowerCase().includes("authorization"), "no auth header key leaked as value ideally");
  const polluted = {
    ...report,
    diagnostics: {
      ...report.diagnostics,
      issues: [
        ...report.diagnostics.issues,
        {
          code: "TEST",
          severity: "INFO" as const,
          message: "Bearer abcdefghijklmnop",
          field: null,
          documentId: null,
          occurrenceId: null,
          partId: null,
          sourceType: null,
          fileName: null,
          sheetName: null,
          rowNumber: null,
          pageNumber: null,
          cellReferences: [] as string[],
          originalLocation: null,
        },
      ],
    },
  };
  const withSecret = serializeAiIntakeDebugReport(polluted);  assert(withSecret.includes("[REDACTED]"), "bearer redacted");
  assert(!json.includes("SECTION"), "no DXF SECTION entity dump");
  console.log("PASS");

  console.log("\n=== Test 8 — no silent truncation ===");
  const largeRows: ExtractedDocumentRow[] = [];
  for (let i = 0; i < 120; i++) {
    largeRows.push({
      documentId: "doc:large",
      matchedDxfPartId: `P${1000 + i}`,
      rawPartReference: `P${1000 + i}`,
      quantity: i + 1,
      thicknessMm: 10,
      material: "S235",
      description: null,
      notes: null,
      action: "INCLUDE",
      documentGeometry: emptyDocumentGeometry(),
      source: {
        type: "XLSX",
        fileName: "large.xls",
        sheetName: "Sheet1",
        rowNumber: i + 2,
        pageNumber: null,
        partReferenceCell: `A${i + 2}`,
        quantityCell: `B${i + 2}`,
        thicknessCell: null,
        materialCell: null,
        excerpt: `row ${i + 2}`,
      },
      issues: [],
    });
  }
  const largeSuccess: AiIntakeAnalyzeSuccess = {
    ...success,
    extraction: { ...success.extraction, documentRows: largeRows },
    aggregated: {
      ...success.aggregated,
      documents: [
        {
          documentId: "doc:large",
          sourceType: "XLSX",
          fileName: "large.xls",
          rows: largeRows,
          unresolvedItems: [],
          warnings: [],
          status: "SUCCESS",
          errorCode: null,
          usage: { inputTokens: null, outputTokens: null, totalTokens: null },
          durationMs: 1,
          workbookEvidence: {
            parserKind: "SHEETJS_XLS",
            snapshot: { sheets: [] },
            mapping: { sheets: [] },
            coverage: { coverageComplete: true, mappedPartRowCount: 120 },
            rawPartRows: largeRows.map((r, idx) => ({
              occurrenceId: buildOccurrenceId(r),
              rawPartReference: r.rawPartReference,
              source: { rowNumber: r.source.rowNumber },
              index: idx,
            })),
            excludedTotalSubtotalRows: [],
            unknownRows: [],
            hiddenPartRowsRequiringReview: [],
            normalizedMeasurements: largeRows.map((r) => ({
              occurrenceId: buildOccurrenceId(r),
              partId: r.matchedDxfPartId,
              rowNumber: r.source.rowNumber,
            })),
            columnUnitProfiles: [],
            precisionComparisons: [],
          },
        },
      ],
    },
  };
  const largeReport = buildAiIntakeDebugReport(largeSuccess, {
    generatedAt: "2026-07-17T05:00:00.000Z",
  });
  const largeJson = serializeAiIntakeDebugReport(largeReport);
  assert(!largeJson.includes('"truncated": true'), "no truncated flag");
  assert(largeReport.documents[0]!.reconstructedRows.length === 120, "all rows");
  const last = largeReport.documents[0]!.reconstructedRows[119] as {
    rawPartReference: string;
  };
  assertEq(last.rawPartReference, "P1119", "final row present");
  console.log("PASS");

  console.log("\n=== Test 9 — stable ordering ===");
  const a = serializeAiIntakeDebugReport(
    buildAiIntakeDebugReport(success, {
      generatedAt: "FIXED",
      dxfParts: report.inputs.dxf.parts,
      emails: report.inputs.emails,
    })
  );
  const b = serializeAiIntakeDebugReport(
    buildAiIntakeDebugReport(success, {
      generatedAt: "FIXED",
      dxfParts: report.inputs.dxf.parts,
      emails: report.inputs.emails,
    })
  );
  assertEq(a, b, "identical serialization");
  console.log("PASS");

  console.log("\n=== Test 10 — clipboard fallback ===");
  const calls: string[] = [];
  const fakeDoc = {
    body: {
      appendChild(el: { value: string }) {
        calls.push(`append:${el.value.slice(0, 20)}`);
      },
      removeChild() {
        calls.push("remove");
      },
    },
    createElement(tag: string) {
      assertEq(tag, "textarea", "textarea");
      return {
        value: "",
        style: {} as Record<string, string>,
        setAttribute() {},
        focus() {},
        select() {},
        setSelectionRange() {},
      };
    },
    execCommand(cmd: string) {
      assertEq(cmd, "copy", "copy cmd");
      calls.push("execCommand:copy");
      return true;
    },
  };
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document: unknown }).document = fakeDoc;
  try {
    fallbackCopyTextToClipboard('{"schemaVersion":"ai-intake-debug-report/v1"}');
    assert(calls.includes("execCommand:copy"), "fallback ran");
  } finally {
    if (prevDoc === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document: unknown }).document = prevDoc;
    }
  }

  const written: string[] = [];
  await copyTextToClipboard('{"ok":true}', {
    writeText: async (t) => {
      written.push(t);
    },
  });
  assertEq(written[0], '{"ok":true}', "clipboard writeText");

  let fallbackUsed = false;
  await copyTextToClipboard("fallback-payload", {
    writeText: async () => {
      throw new Error("denied");
    },
    fallback: (t) => {
      fallbackUsed = t === "fallback-payload";
    },
  });
  assert(fallbackUsed, "falls back when writeText fails");
  console.log("PASS");

  console.log("\nAll debug-report tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
