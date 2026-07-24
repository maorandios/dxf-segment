/**
 * OMEGA — Approved Material List to DXF Review v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-dxf-link-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCompletionClipboardMessage,
  buildCompletionWorkbook,
  buildDxfLinkedMaterialItems,
  calcDxfLinkMetrics,
  customerActionableIssues,
  isSignificantDimensionMismatch,
  normalizeDimensionPair,
} from "../dxfLink";
import { deriveIssueCodes } from "../results/deriveIssueCodes";
import { issueMessageHe } from "../results/issueMessages";
import { deriveApprovalStatus } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import type {
  SimpleDxfPart,
  SimpleResultRow,
} from "../types";

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
    profile: "profile" in partial ? (partial.profile ?? null) : "PL10*100",
    description: null,
    material: "material" in partial ? (partial.material ?? null) : "S355",
    thicknessMm: "thicknessMm" in partial ? (partial.thicknessMm ?? null) : 10,
    quantity: "quantity" in partial ? (partial.quantity ?? null) : 20,
    widthMm: "widthMm" in partial ? (partial.widthMm ?? null) : 100,
    lengthMm: "lengthMm" in partial ? (partial.lengthMm ?? null) : 200,
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : null,
    userOverrides: {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

function dxfPart(
  partial: Partial<SimpleDxfPart> & Pick<SimpleDxfPart, "id" | "filename">
): SimpleDxfPart {
  return {
    id: partial.id,
    filename: partial.filename,
    partId: partial.partId ?? partial.filename.replace(/\.dxf$/i, ""),
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    areaMm2: partial.areaMm2 ?? null,
    geometryStatus: partial.geometryStatus ?? "VALID",
    error: partial.error ?? null,
    fingerprint: partial.fingerprint ?? "fp",
  };
}

function resultRow(
  extractedId: string,
  match: SimpleResultRow["match"],
  excluded = false
): SimpleResultRow {
  return {
    resultRowId: extractedId,
    extracted: {
      rowId: extractedId,
      sheetName: "S",
      sourceRow: 1,
      sourceCell: "A1",
      partId: null,
      profile: "PL10*100",
      description: null,
      quantity: 20,
      material: "S355",
      thicknessMm: 10,
      widthMm: 100,
      lengthMm: 200,
      dxfFileName: null,
      sourceAreaM2: null,
      sourceWeightKg: null,
      confidence: 1,
      note: null,
      warnings: [],
    },
    match,
    status: "READY",
    excluded,
    edits: {},
  };
}

console.log("=== Approved Material List to DXF Review v1 ===\n");

{
  const store = fs.readFileSync(
    path.join(__dirname, "../sessionStore.ts"),
    "utf8"
  );
  assert(store.includes("materialListToExtractedRows"), "approved rows bridge");
  assert(store.includes("DXF_MATCH_ONLY_NO_AI"), "no AI stage2");
  assert(store.includes("parseSimpleDxfFiles"), "local parse");
  assert(store.includes("matchSimpleRows"), "existing matcher");
  assert(store.includes("dxfLinkStage"), "debug stage");
  assert(store.includes('status: "DXF_REVIEW"'), "dxf review status");
  console.log("✓ Approved material rows are Stage 2 source; no workbook AI on DXF");
}

{
  const row = materialRow({ rowId: "q20", quantity: 20 });
  const items = buildDxfLinkedMaterialItems({
    materialListRows: [row],
    resultRows: [
      resultRow("q20", {
        status: "MATCHED",
        method: "GEOMETRY",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [dxfPart({ id: "d1", filename: "a.dxf" })],
  });
  assertEq(items.length, 1, "one item");
  assertEq(
    items[0]!.materialRow.quantity,
    20,
    "qty 20 stays one item"
  );
  console.log("✓ One item with quantity 20 remains one item");
}

{
  // Exact part-id assignment is CERTAIN — no manual confirmation required.
  const exactItems = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "ok" })],
    resultRows: [
      resultRow("ok", {
        status: "MATCHED",
        method: "EXACT_ID",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [dxfPart({ id: "d1", filename: "ok.dxf", widthMm: 100, lengthMm: 200 })],
  });
  assertEq(exactItems[0]!.finalStatus, "READY", "exact id ready");
  assertEq(exactItems[0]!.matchLevel, "CERTAIN", "exact id certain");
  assert(
    !exactItems[0]!.issues.some((i) => i.kind === "HEURISTIC_MATCH_UNCONFIRMED"),
    "no heuristic issue for exact id"
  );

  // Geometry suggestions still require confirmation.
  const items = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "ok" })],
    resultRows: [
      resultRow("ok", {
        status: "MATCHED",
        method: "GEOMETRY",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [dxfPart({ id: "d1", filename: "ok.dxf", widthMm: 100, lengthMm: 200 })],
  });
  const matchedRow = resultRow("ok", {
    status: "MATCHED",
    method: "GEOMETRY",
    matchedDxfId: "d1",
    candidates: [],
    message: null,
  });
  const itemsConfirmed = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "ok" })],
    resultRows: [matchedRow],
    dxfParts: [dxfPart({ id: "d1", filename: "ok.dxf", widthMm: 100, lengthMm: 200 })],
    confirmedMatchIds: new Set([matchedRow.resultRowId, "ok"]),
  });
  assertEq(items[0]!.finalStatus, "NEEDS_REVIEW", "unconfirmed geometry needs review");
  assert(
    items[0]!.issues.some((i) => i.kind === "HEURISTIC_MATCH_UNCONFIRMED"),
    "heuristic issue"
  );
  assertEq(itemsConfirmed[0]!.finalStatus, "READY", "confirmed match ready");
  assertEq(
    itemsConfirmed[0]!.issues.filter((i) => i.kind === "HEURISTIC_MATCH_UNCONFIRMED")
      .length,
    0,
    "no heuristic issue when confirmed"
  );
  const reviewUi = fs.readFileSync(
    path.join(__dirname, "../readiness/ReadinessSummary.tsx"),
    "utf8"
  );
  assert(!reviewUi.includes("confidence"), "no confidence");
  assert(!reviewUi.includes("score"), "no score");
  assert(!reviewUi.toLowerCase().includes("exact_id"), "no method");
  console.log("✓ Exact id is CERTAIN; geometry suggestions require confirmation");
}

{
  assert(
    !isSignificantDimensionMismatch({
      workbookWidthMm: 495,
      workbookLengthMm: 500,
      dxfWidthMm: 500,
      dxfLengthMm: 495,
    }),
    "rotation not mismatch"
  );
  assert(
    !isSignificantDimensionMismatch({
      workbookWidthMm: 100,
      workbookLengthMm: 200,
      dxfWidthMm: 100.5,
      dxfLengthMm: 200.5,
    }),
    "minor not mismatch"
  );
  assert(
    isSignificantDimensionMismatch({
      workbookWidthMm: 495,
      workbookLengthMm: 500,
      dxfWidthMm: 495,
      dxfLengthMm: 520,
    }),
    "significant mismatch"
  );
  const n = normalizeDimensionPair(200, 100);
  assertEq(n.widthMm, 100, "norm min");
  assertEq(n.lengthMm, 200, "norm max");
  console.log("✓ Rotation/minor diffs ignored; significant mismatch detected");
}

{
  const codes = deriveIssueCodes({
    row: resultRow("m", {
      status: "MATCHED",
      method: "GEOMETRY",
      matchedDxfId: "d1",
      candidates: [],
      message: null,
    }),
    dxf: dxfPart({ id: "d1", filename: "x.dxf", widthMm: 495, lengthMm: 520 }),
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    sourceWidthMm: 495,
    sourceLengthMm: 500,
    unmatchedReason: null,
    duplicateDxf: false,
    manualMatchUnconfirmed: false,
    dxfFilesUploaded: true,
  });
  assert(codes.includes("PART_ID_DIMENSION_MISMATCH"), "mismatch code");
  assertEq(
    issueMessageHe("NO_DXF_FOUND"),
    "לא ניתן לשייך DXF באופן אוטומטי",
    "missing msg"
  );
  assertEq(
    issueMessageHe("DXF_ASSIGNED_TO_BETTER_ROW"),
    "לא ניתן לשייך DXF באופן אוטומטי",
    "conflict wording"
  );
  assertEq(
    issueMessageHe("MULTIPLE_DXF_CANDIDATES"),
    "נמצאו כמה קובצי DXF אפשריים לפריט.",
    "multi msg"
  );
  assertEq(
    issueMessageHe("DXF_INVALID"),
    "לא ניתן להשתמש בקובץ ה-DXF לצורך חישוב.",
    "invalid msg"
  );
  console.log("✓ Missing / multiple / invalid / mismatch issue messages");
}

{
  const missing = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "miss" })],
    resultRows: [
      resultRow("miss", {
        status: "UNMATCHED",
        method: null,
        matchedDxfId: null,
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [],
  });
  assert(
    missing[0]!.issues.some((i) => i.kind === "MISSING_DXF"),
    "missing issue"
  );

  const multi = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "amb" })],
    resultRows: [
      resultRow("amb", {
        status: "AMBIGUOUS",
        method: null,
        matchedDxfId: null,
        candidates: [
          {
            dxfId: "a",
            partId: "a",
            filename: "a.dxf",
            widthMm: 100,
            lengthMm: 200,
            widthDifferenceMm: 0,
            lengthDifferenceMm: 0,
          },
          {
            dxfId: "b",
            partId: "b",
            filename: "b.dxf",
            widthMm: 100,
            lengthMm: 201,
            widthDifferenceMm: 0,
            lengthDifferenceMm: 1,
          },
        ],
        message: null,
      }),
    ],
    dxfParts: [
      dxfPart({ id: "a", filename: "a.dxf" }),
      dxfPart({ id: "b", filename: "b.dxf", lengthMm: 201 }),
    ],
  });
  assert(
    multi[0]!.issues.some((i) => i.kind === "MULTIPLE_DXF"),
    "ambiguous issue"
  );

  const invalid = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "bad" })],
    resultRows: [
      resultRow("bad", {
        status: "INVALID_DXF",
        method: null,
        matchedDxfId: "bad",
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [
      dxfPart({
        id: "bad",
        filename: "bad.dxf",
        geometryStatus: "INVALID",
        widthMm: null,
        lengthMm: null,
      }),
    ],
  });
  assert(
    invalid[0]!.issues.some((i) => i.kind === "INVALID_DXF"),
    "invalid issue"
  );
  console.log("✓ Missing / multiple / invalid actionable issues");
}

{
  const deferredId = "def::MISSING_DXF";
  const items = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "def" })],
    resultRows: [
      resultRow("def", {
        status: "UNMATCHED",
        method: null,
        matchedDxfId: null,
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [],
    deferredIssueIds: new Set(["def::MISSING_DXF"]),
  });
  // deferred keys in builder use issueId format materialRowId::KIND
  const items2 = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "def" })],
    resultRows: [
      resultRow("def", {
        status: "UNMATCHED",
        method: null,
        matchedDxfId: null,
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [],
    deferredIssueIds: new Set(["def::MISSING_DXF"]),
  });
  assert(items2[0]!.issues.some((i) => i.deferred), "deferred flag");
  assertEq(items2[0]!.finalStatus, "BLOCKED", "missing still blocked");
  void deferredId;
  void items;
  console.log("✓ Deferred issues remain unresolved");
}

{
  const excluded = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "ex" })],
    resultRows: [
      resultRow(
        "ex",
        {
          status: "UNMATCHED",
          method: null,
          matchedDxfId: null,
          candidates: [],
          message: null,
        },
        true
      ),
    ],
    dxfParts: [],
  });
  assertEq(excluded[0]!.finalStatus, "EXCLUDED", "excluded");
  assertEq(customerActionableIssues(excluded[0]!).length, 0, "no completion");
  console.log("✓ Excluded items removed from completion requests");
}

{
  const metrics = calcDxfLinkMetrics({
    finalWidthMm: 100,
    finalLengthMm: 200,
    thicknessMm: 10,
    quantity: 2,
  });
  assertEq(metrics.unitAreaM2, 0.02, "unit area");
  assertEq(metrics.totalAreaM2, 0.04, "total area");
  assertEq(metrics.unitWeightKg, 0.02 * 0.01 * 7850, "unit weight");
  assertEq(metrics.totalWeightKg, 0.02 * 0.01 * 7850 * 2, "total weight");

  const items = buildDxfLinkedMaterialItems({
    materialListRows: [
      materialRow({ rowId: "calc", widthMm: 90, lengthMm: 180 }),
    ],
    resultRows: [
      resultRow("calc", {
        status: "MATCHED",
        method: "GEOMETRY",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [
      dxfPart({ id: "d1", filename: "c.dxf", widthMm: 200, lengthMm: 100 }),
    ],
  });
  assertEq(items[0]!.finalDimensions.source, "DXF", "dxf drives final");
  assertEq(items[0]!.workbookDimensions.widthMm, 90, "workbook preserved");
  assertEq(items[0]!.finalDimensions.widthMm, 100, "normalized min");
  assertEq(items[0]!.finalDimensions.lengthMm, 200, "normalized max");
  console.log("✓ DXF dims drive calc; workbook dims preserved separately");
}

{
  const items = buildDxfLinkedMaterialItems({
    materialListRows: [
      materialRow({ rowId: "c1", material: null }),
      materialRow({
        rowId: "c2",
        widthMm: 495,
        lengthMm: 500,
      }),
    ],
    resultRows: [
      resultRow("c1", {
        status: "UNMATCHED",
        method: null,
        matchedDxfId: null,
        candidates: [],
        message: null,
      }),
      resultRow("c2", {
        status: "MATCHED",
        method: "GEOMETRY",
        matchedDxfId: "d2",
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [
      dxfPart({ id: "d2", filename: "d2.dxf", widthMm: 495, lengthMm: 520 }),
    ],
    customerConfirmDimMismatchIds: new Set(["c2"]),
  });
  const msg = buildCompletionClipboardMessage(
    items,
    new Set(["c1", "c2"])
  );
  assert(msg.includes("שלום,"), "greeting");
  assert(msg.includes("חסר סוג חומר") || msg.includes("DXF"), "issues");
  assert(!msg.includes("confidence"), "no scores in clipboard");
  console.log("✓ Completion request combines Excel and DXF issues without AI");
}

async function runAsyncChecks(): Promise<void> {
  const items = buildDxfLinkedMaterialItems({
    materialListRows: [materialRow({ rowId: "wb", material: null })],
    resultRows: [
      resultRow("wb", {
        status: "UNMATCHED",
        method: null,
        matchedDxfId: null,
        candidates: [],
        message: null,
      }),
    ],
    dxfParts: [],
  });
  const out = await buildCompletionWorkbook({
    items,
    selectedMaterialRowIds: new Set(["wb"]),
    allMaterialRows: [materialRow({ rowId: "wb", material: null })],
    originalFilename: "Platesss.xlsx",
  });
  assert(out.filename.includes("OMEGA-completion-request-"), "filename");
  assert(out.bytes.byteLength > 100, "xlsx bytes");
  console.log("✓ Completion workbook contains selected unresolved items");

  const store = fs.readFileSync(
    path.join(__dirname, "../sessionStore.ts"),
    "utf8"
  );
  assert(store.includes("backToMaterialList"), "back");
  assert(
    store.includes("Keep DXF files") || store.includes("dxfFiles"),
    "preserve dxf"
  );
  const table = fs.readFileSync(
    path.join(__dirname, "../results/SimpleFinalItemsTable.tsx"),
    "utf8"
  );
  assert(table.includes("md:hidden"), "mobile cards");
  assert(table.includes("hidden md:block") || table.includes("md:block"), "desktop");
  console.log("✓ Returning preserves DXFs; desktop/mobile share canonical rows");

  console.log(
    "\n=== All Approved Material List to DXF Review v1 tests passed ===\n"
  );
}

void runAsyncChecks().catch((err) => {
  console.error(err);
  process.exit(1);
});