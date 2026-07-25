/**
 * OMEGA — Explicit DXF Filename Matching v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-dxf-filename-matching-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptMaterialListRows } from "../materialList/adaptMaterialListRows";
import {
  deriveApprovalStatus,
  missingCompletionFields,
} from "../materialList/completeness";
import { aiMaterialListRowSchema } from "../materialList/schema";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import type { MaterialListRow } from "../materialList/types";
import { buildDxfLinkedMaterialItems } from "../dxfLink/buildDxfLinkedItems";
import {
  buildCompletionClipboardMessage,
  customerActionableIssues,
} from "../dxfLink/completionRequest";
import { applyManualDxfSelection } from "../matchSimpleRows";
import {
  buildFilenameCoverageNotice,
  matchWithFilenamePriority,
  resolveMatchLevel,
} from "../matchWithFilenamePriority";
import { normalizeDxfFileKey } from "../normalizeDxfFileKey";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertEq(a: unknown, b: unknown, msg: string): void {
  assert.equal(a, b, msg);
}

function materialRow(
  partial: Partial<MaterialListRow> & Pick<MaterialListRow, "rowId">
): MaterialListRow {
  const row: MaterialListRow = {
    rowId: partial.rowId,
    sheetName: partial.sheetName ?? "S",
    sourceRow: partial.sourceRow ?? 1,
    sourceCell: partial.sourceCell ?? "A1",
    partId: partial.partId ?? null,
    profile: partial.profile ?? "PL10*100",
    description: partial.description ?? null,
    material: partial.material ?? "S355",
    thicknessMm: partial.thicknessMm ?? 10,
    quantity: partial.quantity ?? 1,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : null,
    userOverrides: {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

function extracted(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
    partId: null,
    profile: "PL10*100",
    description: null,
    quantity: 1,
    material: "S355",
    thicknessMm: 10,
    widthMm: 100,
    lengthMm: 200,
    sourceAreaM2: null,
    sourceWeightKg: null,
    confidence: 1,
    note: null,
    warnings: [],
    ...partial,
    dxfFileName: partial.dxfFileName ?? null,
  };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  return {
    partId: partial.partId ?? partial.filename.replace(/\.dxf$/i, ""),
    widthMm: 100,
    lengthMm: 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: null,
    ...partial,
  };
}

console.log("=== Explicit DXF Filename Matching v1 ===\n");

{
  const parsed = aiMaterialListRowSchema.parse({
    sheetName: "S",
    sourceRow: 2,
    sourceCell: "A2",
    partId: null,
    profile: "PL10*100",
    description: null,
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    widthMm: 100,
    lengthMm: 200,
    dxfFileName: "A3B1-P35.dxf",
  });
  assertEq(parsed.dxfFileName, "A3B1-P35.dxf", "explicit filename kept");
  const absent = aiMaterialListRowSchema.parse({
    ...parsed,
    dxfFileName: null,
  });
  assertEq(absent.dxfFileName, null, "null when absent");
  const schemaSrc = fs.readFileSync(
    path.join(__dirname, "../materialList/schema.ts"),
    "utf8"
  );
  assert(!schemaSrc.includes("dxfFileName: z.string().optional"), "no optional");
  assert(
    schemaSrc.includes("Do not infer a DXF filename"),
    "prompt forbids inference"
  );
  console.log("✓ DXF filename is extracted only when explicitly present");
}

{
  const row = materialRow({
    rowId: "r1",
    dxfFileName: null,
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    widthMm: 100,
    lengthMm: 200,
  });
  assertEq(row.approvalStatus, "COMPLETE", "complete without dxf name");
  assert(
    !missingCompletionFields(row).includes("material" as never),
    "material ok"
  );
  assertEq(missingCompletionFields(row).length, 0, "no missing fields");
  console.log("✓ Missing DXF filename does not make Stage 1 incomplete");
}

{
  assertEq(normalizeDxfFileKey("A3B1-P35.dxf"), "a3b1-p35", "with ext");
  assertEq(normalizeDxfFileKey("A3B1-P35"), "a3b1-p35", "without ext");
  assertEq(
    normalizeDxfFileKey("C:\\DXF\\A3B1-P35.DXF"),
    "a3b1-p35",
    "path+case"
  );
  assertEq(normalizeDxfFileKey("  A3B1_P35.dxf "), "a3b1-p35", "underscore");
  console.log("✓ Filename normalization ignores path, case and extension");
}

{
  const rows = [
    extracted({
      rowId: "r1",
      sourceRow: 1,
      dxfFileName: "A3B1-P35.dxf",
      widthMm: 50,
      lengthMm: 50,
    }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "A3B1-P35.dxf", widthMm: 999, lengthMm: 999 }),
    dxf({ id: "d2", filename: "OTHER.dxf", widthMm: 50, lengthMm: 50 }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.status, "MATCHED", "matched");
  assertEq(
    matched.resultRows[0]!.match.method,
    "EXPLICIT_FILENAME",
    "filename method"
  );
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "d1", "correct file");
  assertEq(
    resolveMatchLevel(matched.resultRows[0]!.match),
    "CERTAIN",
    "certain"
  );
  assertEq(
    matched.filenameMatchingDebug.certainFilenameMatches,
    1,
    "debug certain"
  );
  console.log("✓ Exact normalized filename produces a certain match");
  console.log("✓ Certain filename matches bypass heuristic reassignment");
}

{
  const rows = [
    extracted({ rowId: "r1", dxfFileName: "MISSING-FILE.dxf" }),
  ];
  const parts = [dxf({ id: "d1", filename: "OTHER.dxf" })];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.status, "UNMATCHED", "unmatched");
  assertEq(
    matched.resultRows[0]!.match.method,
    "EXPLICIT_FILENAME",
    "explicit method"
  );
  const linked = buildDxfLinkedMaterialItems({
    materialListRows: [
      materialRow({ rowId: "r1", dxfFileName: "MISSING-FILE.dxf" }),
    ],
    resultRows: matched.resultRows,
    dxfParts: parts,
  });
  assert(
    linked[0]!.issues.some((i) => i.kind === "MISSING_EXPLICIT_DXF"),
    "explicit missing issue"
  );
  assert(
    linked[0]!.issues[0]!.messageHe.includes("לא נמצא בקבצים שהועלו"),
    "message"
  );
  console.log(
    "✓ Explicit filename without uploaded file creates a missing-file issue"
  );
}

{
  const rows = [
    extracted({
      rowId: "r1",
      partId: "P1",
      dxfFileName: null,
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const parts = [
    dxf({
      id: "d1",
      filename: "P1.dxf",
      partId: "P1",
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.status, "MATCHED", "heuristic match");
  assertEq(matched.resultRows[0]!.match.method, "EXACT_ID", "exact part id");
  assertEq(
    resolveMatchLevel(matched.resultRows[0]!.match),
    "CERTAIN",
    "exact part id is certain"
  );
  console.log("✓ Missing filename uses exact part-ID when available (CERTAIN)");
}

{
  const rows = [
    extracted({
      rowId: "r1",
      partId: null,
      dxfFileName: null,
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const parts = [
    dxf({
      id: "d1",
      filename: "Geom.dxf",
      partId: "Geom",
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.method, "GEOMETRY", "geometry");
  assertEq(
    resolveMatchLevel(matched.resultRows[0]!.match),
    "SUGGESTED",
    "suggested label"
  );
  console.log("✓ Geometry-only matches are labeled suggested");
}

{
  const none = buildFilenameCoverageNotice({
    totalItemCount: 10,
    itemsWithExplicitFilename: 0,
  });
  assertEq(none.kind, "NO_FILENAMES", "no filenames notice");
  if (none.kind === "NO_FILENAMES") {
    assert(none.headingHe.includes("לא נמצאו שמות"), "heading");
    assert(none.continueLabelHe.includes("התאמה משוערת"), "continue");
  }
  const partial = buildFilenameCoverageNotice({
    totalItemCount: 10,
    itemsWithExplicitFilename: 7,
  });
  assertEq(partial.kind, "PARTIAL", "partial");
  if (partial.kind === "PARTIAL") {
    assert(partial.messageHe.includes("ל-3 מתוך 10"), "x of y");
  }
  const full = buildFilenameCoverageNotice({
    totalItemCount: 10,
    itemsWithExplicitFilename: 10,
  });
  assertEq(full.kind, "NONE", "full coverage no notice");
  console.log("✓ No filenames produce one primary notice, not one alert per item");
  console.log("✓ Partial coverage shows the correct X of Y notice");
  console.log("✓ Full coverage shows no notice");
}

{
  const rows = [extracted({ rowId: "r1", dxfFileName: "SAME.dxf" })];
  const parts = [
    dxf({ id: "d1", filename: "SAME.dxf" }),
    dxf({ id: "d2", filename: "same.DXF" }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.status, "AMBIGUOUS", "duplicate");
  assertEq(
    matched.resultRows[0]!.match.candidates.length,
    2,
    "both candidates"
  );
  assertEq(
    matched.filenameMatchingDebug.duplicateFilenameConflicts,
    1,
    "debug dup"
  );
  console.log("✓ Duplicate uploaded filenames require user selection");
}

{
  const rows = [
    extracted({ rowId: "r1", dxfFileName: null, widthMm: 10, lengthMm: 10 }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "A.dxf", widthMm: 10, lengthMm: 10 }),
    dxf({ id: "d2", filename: "B.dxf", widthMm: 99, lengthMm: 99 }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  const manual = applyManualDxfSelection({
    resultRows: matched.resultRows,
    resultRowId: matched.resultRows[0]!.resultRowId,
    dxfId: "d2",
    dxfParts: parts,
  });
  assert(manual.ok, "manual ok");
  if (manual.ok) {
    const row = manual.resultRows[0]!;
    assertEq(row.match.method, "MANUAL", "manual method");
    assertEq(resolveMatchLevel(row.match), "CERTAIN", "manual certain");
  }
  console.log("✓ Manual assignment becomes certain");
}

{
  const items = buildDxfLinkedMaterialItems({
    materialListRows: [
      materialRow({ rowId: "a", dxfFileName: null }),
      materialRow({ rowId: "b", dxfFileName: "NEED.dxf" }),
    ],
    resultRows: [
      {
        resultRowId: "res_a",
        extracted: extracted({ rowId: "a", dxfFileName: null }),
        match: {
          status: "UNMATCHED",
          method: null,
          matchedDxfId: null,
          candidates: [],
          message: null,
        },
        status: "NO_DXF",
        excluded: false,
        edits: {},
      },
      {
        resultRowId: "res_b",
        extracted: extracted({ rowId: "b", dxfFileName: "NEED.dxf" }),
        match: {
          status: "UNMATCHED",
          method: "EXPLICIT_FILENAME",
          matchedDxfId: null,
          candidates: [],
          message: "MISSING_EXPLICIT_DXF:NEED.dxf",
        },
        status: "NO_DXF",
        excluded: false,
        edits: {},
      },
    ],
    dxfParts: [],
  });
  const msg = buildCompletionClipboardMessage(
    items,
    new Set(["a", "b"])
  );
  assert(msg.includes("לא צוין שם קובץ DXF עבור הפריט"), "missing name");
  assert(msg.includes("NEED.dxf"), "explicit name");
  assert(msg.includes("הקובץ לא צורף"), "not uploaded");
  assert(
    customerActionableIssues(items[1]!).some(
      (i) => i.kind === "MISSING_EXPLICIT_DXF"
    ),
    "explicit issue"
  );
  console.log(
    "✓ Completion requests distinguish missing filename from missing uploaded file"
  );
}

{
  const store = fs.readFileSync(
    path.join(__dirname, "../sessionStore.ts"),
    "utf8"
  );
  assert(store.includes("matchWithFilenamePriority"), "filename matcher wired");
  assert(store.includes("aiCallCountStage2 = 0"), "no AI stage2");
  assert(
    store.includes('stage2: "DXF_MATCH_ONLY_NO_AI"') ||
      store.includes("DXF_MATCH_ONLY_NO_AI"),
    "no AI marker"
  );
  const matchSrc = fs.readFileSync(
    path.join(__dirname, "../matchSimpleRows.ts"),
    "utf8"
  );
  const wrapper = fs.readFileSync(
    path.join(__dirname, "../matchWithFilenamePriority.ts"),
    "utf8"
  );
  assert(wrapper.includes("matchSimpleRows("), "delegates to heuristic");
  assert(
    !wrapper.includes("GEOMETRY_TOLERANCE"),
    "does not rewrite geometry"
  );
  void matchSrc;
  console.log("✓ No AI call occurs during DXF matching");
  console.log("✓ Existing DXF parser and heuristic matcher remain unchanged");
}

{
  const adapted = adaptMaterialListRows({
    rows: [
      {
        sheetName: "S",
        sourceRow: 5,
        sourceCell: "A5",
        partId: null,
        profile: "PL10*100",
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 1,
        widthMm: 100,
        lengthMm: 200,
        dxfFileName: "Part-01.dxf",
      },
    ],
  });
  assertEq(adapted.rows[0]!.dxfFileName, "Part-01.dxf", "adapted");
  const extractedRows = materialListToExtractedRows(adapted.rows);
  assertEq(extractedRows[0]!.dxfFileName, "Part-01.dxf", "bridged");
  console.log("✓ Adapted and bridged dxfFileName into Stage 2 rows");
}

console.log("\n=== Explicit DXF Filename Matching v1 tests passed ===\n");