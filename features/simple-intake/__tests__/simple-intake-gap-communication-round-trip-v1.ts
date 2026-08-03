/**
 * OMEGA — Gap Communication Actions and Round-Trip Excel Export v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-gap-communication-round-trip-v1.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertGapCommunicationInvariants,
  buildGapCommunicationDiagnostics,
  buildGapCommunicationRows,
  buildGapEmailDraft,
  buildRoundTripExcelNote,
  buildRoundTripExcelWorkbook,
  copyGapEmailToClipboard,
  deriveCustomerFacingGapText,
  deriveRoundTripActionHighlights,
  formatGapEmailClipboardPayload,
  isOmegaRoundTripWorkbook,
  OMEGA_ROUND_TRIP_HEADERS,
  parseOmegaRoundTripWorkbook,
  parseOmegaRoundTripWorkbookWithMeta,
} from "../gapCommunication";
import { comparePlateDimensions } from "../dxfLink/dimensionMismatch";
import type { FinalIntakeRow } from "../results/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function baseRow(
  partial: Partial<FinalIntakeRow> &
    Pick<FinalIntakeRow, "id" | "materialRowId" | "status" | "issueCodes">
): FinalIntakeRow {
  return {
    reviewStatus: partial.status,
    part: {
      displayName: partial.part?.displayName ?? "P1",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partial.part?.sourcePartId ?? "P1",
      sourceProfile: null,
      matchedDxfId: partial.part?.matchedDxfId ?? null,
      matchedDxfPartId: null,
      matchedDxfFilename: partial.part?.matchedDxfFilename ?? null,
    },
    preview: {
      dxfId: partial.part?.matchedDxfId ?? null,
      geometryAvailable: Boolean(partial.part?.matchedDxfId),
    },
    material: partial.material ?? "S355",
    thicknessMm: partial.thicknessMm ?? 10,
    quantity: partial.quantity ?? 1,
    dxfDimensions: partial.dxfDimensions ?? { widthMm: 100, lengthMm: 200 },
    commercial: { areaM2: null, unitWeightKg: null, totalWeightKg: null },
    source: {
      workbookFilename: "w.xlsx",
      sheetName: "S",
      sourceRow: partial.source?.sourceRow ?? 1,
      sourceCell: "A1",
      sourceText: null,
      sourceWidthMm: partial.source?.sourceWidthMm ?? 100,
      sourceLengthMm: partial.source?.sourceLengthMm ?? 200,
      sourceAreaM2: null,
      sourceWeightKg: null,
      ...(partial.source ?? {}),
    },
    primaryMessage: null,
    availableActions: [],
    isManuallyMatched: false,
    isManualMatchConfirmed: partial.isManualMatchConfirmed ?? false,
    isExcluded: partial.isExcluded ?? false,
    match: partial.match ?? {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    sourceOrderIndex: partial.sourceOrderIndex ?? 0,
    dimensionComparison: partial.dimensionComparison ?? null,
    rawDxfDimensions: partial.rawDxfDimensions ?? {
      widthMm: 100,
      lengthMm: 200,
    },
    dimensionMismatchResolution: partial.dimensionMismatchResolution ?? null,
    ...partial,
  } as FinalIntakeRow;
}

function readyRow(id: string, order: number): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId: id,
    status: "READY",
    issueCodes: [],
    sourceOrderIndex: order,
    part: {
      displayName: id,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: id,
      sourceProfile: null,
      matchedDxfId: `dxf_${id}`,
      matchedDxfPartId: id,
      matchedDxfFilename: `${id}.dxf`,
    },
    preview: { dxfId: `dxf_${id}`, geometryAvailable: true },
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
  });
}

console.log("— Gap communication / round-trip v1 —");

async function main(): Promise<void> {
// Toolbar source asserts
{
  const toolbar = fs.readFileSync(
    path.join(root, "workflow/GapWorkspaceToolbar.tsx"),
    "utf8"
  );
  for (const action of [
    "CREATE_GAP_EMAIL",
    "EXPORT_ROUND_TRIP_EXCEL",
    "CONTINUE_TO_FINAL_TABLE",
  ]) {
    assert(toolbar.includes(action), `toolbar exposes ${action}`);
  }
  assert(!toolbar.includes("חזרה להעלאת הקבצים"), "no upload back after analysis");
  assert(!toolbar.includes("BACK_TO_UPLOAD"), "BACK_TO_UPLOAD removed");
  assert(!toolbar.includes("חזרה לסיכום"), "summary back gone");
  assert(toolbar.includes("צור מייל פערים"), "email label");
  assert(toolbar.includes("ייצא דוח Excel"), "excel label");
  assert(toolbar.includes("הצג טבלה מסכמת"), "continue label");
  console.log("✓ three-action toolbar exposed (no upload back)");
}

{
  const ws = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  assert(ws.includes("GapWorkspaceToolbar"), "workspace uses toolbar");
  assert(ws.includes("GapEmailModal"), "workspace uses email modal");
  assert(!ws.includes("onBackToUpload"), "no back-to-upload after analysis");
  assert(ws.includes("onContinueToTable"), "continue navigation wired");
  assert(!ws.includes("openai") && !ws.includes("OpenAI"), "no AI in workspace email path");
  console.log("✓ workspace navigation + email modal (no AI)");
}

// Customer-facing text
{
  const missingId = baseRow({
    id: "r1",
    materialRowId: "r1",
    status: "BLOCKED",
    issueCodes: ["NO_DXF_FOUND"],
    part: {
      displayName: "?",
      displayNameSource: "FALLBACK",
      sourcePartId: null,
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
    preview: { dxfId: null, geometryAvailable: false },
    match: { status: "UNMATCHED", method: null, candidates: [], message: null },
  });
  const t1 = deriveCustomerFacingGapText(missingId);
  assertEq(t1.problem, "חסר שם הפריט ברשימת החומר.", "missing id problem");

  const missingDxf = baseRow({
    id: "r2",
    materialRowId: "r2",
    status: "BLOCKED",
    issueCodes: ["NO_DXF_FOUND"],
    part: {
      displayName: "p1154",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: "p1154",
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
    preview: { dxfId: null, geometryAvailable: false },
    match: { status: "UNMATCHED", method: null, candidates: [], message: null },
  });
  const t2 = deriveCustomerFacingGapText(missingDxf);
  assert(
    t2.problem?.includes("p1154") === true,
    "missing dxf mentions part id"
  );

  const missingMat = readyRow("p1010", 0);
  missingMat.material = null;
  missingMat.status = "BLOCKED";
  const t3 = deriveCustomerFacingGapText(missingMat);
  assertEq(t3.problem, "חסר סוג חומר.", "missing material");

  console.log("✓ deterministic customer-facing text");
}

// Communication rows + email scope
{
  const ready = readyRow("pReady", 0);
  const gap = baseRow({
    id: "rGap",
    materialRowId: "rGap",
    status: "BLOCKED",
    issueCodes: ["MISSING_MATERIAL"],
    sourceOrderIndex: 1,
    material: null,
    part: {
      displayName: "p1010",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: "p1010",
      sourceProfile: null,
      matchedDxfId: "dxf1",
      matchedDxfPartId: "p1010",
      matchedDxfFilename: "p1010.dxf",
    },
    preview: { dxfId: "dxf1", geometryAvailable: true },
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
  });
  const rows = buildGapCommunicationRows([ready, gap]);
  assertEq(rows.length, 2, "all material rows in projection");
  const email = buildGapEmailDraft({
    quotationName: "פרויקט א",
    rows,
    dxfFindings: [
      {
        id: "f1",
        type: "UNREFERENCED_DXF",
        severity: "INFO",
        dxfIds: ["x"],
        title: "unref",
        description: "p1004.dxf",
      },
    ],
  });
  assert(email.subject.includes("פרויקט א"), "subject has quotation name");
  assert(
    email.subject.startsWith("פרויקט א - השלמת נתונים לצורך הצעת מחיר"),
    "subject format"
  );
  assert(email.bodyHtml.includes("<strong>"), "html bold titles");
  assert(email.body.includes("p1010"), "email includes unresolved");
  assert(!email.body.includes("pReady"), "email omits ready part id as item");
  assert(email.body.includes("מצב קובצי DXF"), "dxf findings section");
  assert(email.body.includes("p1004.dxf"), "dxf finding detail");
  console.log("✓ email scope + DXF findings section");
}

// Editable copy payload
{
  const payload = formatGapEmailClipboardPayload("נושא ערוך", "גוף ערוך");
  assert(payload.startsWith("נושא: נושא ערוך"), "copy uses edited subject");
  assert(payload.includes("גוף ערוך"), "copy uses edited body");
  let wrote = "";
  const result = await copyGapEmailToClipboard({
    subject: "S",
    body: "B",
    deps: {
      writeText: async (t) => {
        wrote = t;
      },
    },
  });
  assertEq(result.ok, true, "clipboard ok");
  assert(wrote.includes("נושא: S"), "clipboard plain payload");
  console.log("✓ clipboard copies edited content");
}

// Within-tolerance vs significant
{
  const within = comparePlateDimensions(
    { widthMm: 77, lengthMm: 65 },
    { widthMm: 76.76, lengthMm: 65 }
  );
  assert(within && within.hasSignificantMismatch === false, "within tol");

  const significant = comparePlateDimensions(
    { widthMm: 255, lengthMm: 255 },
    { widthMm: 255, lengthMm: 400 }
  );
  assert(significant?.hasSignificantMismatch === true, "significant mismatch");

  const withinRow = readyRow("pTol", 0);
  withinRow.source.sourceWidthMm = 77;
  withinRow.source.sourceLengthMm = 65;
  withinRow.dxfDimensions = { widthMm: 76.76, lengthMm: 65 };
  withinRow.rawDxfDimensions = { widthMm: 76.76, lengthMm: 65 };
  withinRow.dimensionComparison = within;

  const sigRow = readyRow("pSig", 1);
  sigRow.source.sourceWidthMm = 255;
  sigRow.source.sourceLengthMm = 255;
  sigRow.dxfDimensions = { widthMm: 255, lengthMm: 400 };
  sigRow.rawDxfDimensions = { widthMm: 255, lengthMm: 400 };
  sigRow.dimensionComparison = significant;
  sigRow.dimensionMismatchResolution = "UNRESOLVED";
  sigRow.status = "NEEDS_REVIEW";

  const rows = buildGapCommunicationRows([withinRow, sigRow]);
  const withinComm = rows.find((r) => r.materialRowId === "pTol")!;
  const sigComm = rows.find((r) => r.materialRowId === "pSig")!;
  assertEq(withinComm.isReadyForPricing, true, "within-tol ready");
  assert(
    buildRoundTripExcelNote(withinComm).includes("טולרנס"),
    "within-tol audit note"
  );
  assertEq(sigComm.category, "DIMENSION_REVIEW", "significant → review");
  assert(
    buildRoundTripExcelNote(sigComm).includes("פער משמעותי"),
    "significant note"
  );

  const highlights = deriveRoundTripActionHighlights(rows);
  assert(
    !highlights.some((h) => h.rowIndex === rows.indexOf(withinComm)),
    "within-tol no orange"
  );
  assert(
    highlights.some(
      (h) =>
        h.rowIndex === rows.indexOf(sigComm) &&
        (h.columnKey === "sourceWidthMm" || h.columnKey === "sourceLengthMm")
    ),
    "significant highlights source dims"
  );
  console.log("✓ tolerance highlighting + notes");
}

// Excel export shape
{
  const rows = buildGapCommunicationRows([
    readyRow("p1", 0),
    baseRow({
      id: "r2",
      materialRowId: "r2",
      status: "BLOCKED",
      issueCodes: ["NO_DXF_FOUND"],
      sourceOrderIndex: 1,
      part: {
        displayName: "p2",
        displayNameSource: "SOURCE_PART_ID",
        sourcePartId: "p2",
        sourceProfile: null,
        matchedDxfId: null,
        matchedDxfPartId: null,
        matchedDxfFilename: null,
      },
      preview: { dxfId: null, geometryAvailable: false },
      match: {
        status: "UNMATCHED",
        method: null,
        candidates: [],
        message: null,
      },
    }),
  ]);
  const wb = await buildRoundTripExcelWorkbook({
    rows,
    projectName: "בדיקה",
    customerName: "לקוח",
    date: new Date(2026, 7, 1),
  });
  assertEq(
    wb.filename,
    "דוח השלמת נתונים_בדיקה_לקוח_01-08-2026.xlsx",
    "excel filename format"
  );
  assertEq(wb.sheetCount, 1, "one sheet");
  assertEq(wb.statusColumnCount, 0, "no status column");
  assertEq(wb.dataRowCount, rows.length, "all material rows");
  assertEq(wb.columnCount, OMEGA_ROUND_TRIP_HEADERS.length, "10 columns");
  assert(!OMEGA_ROUND_TRIP_HEADERS.includes("סטטוס" as never), "no status header");
  assertEq(OMEGA_ROUND_TRIP_HEADERS[0], "שם הפריט", "part name header");
  assertEq(OMEGA_ROUND_TRIP_HEADERS[9], "הערות", "notes last");

  const excelSrc = fs.readFileSync(
    path.join(root, "gapCommunication/buildRoundTripExcel.ts"),
    "utf8"
  );
  assert(excelSrc.includes("appendExcelCompanyFooter"), "company footer on export");

  // Source dims preserved separately from DXF
  const ready = rows[0]!;
  assertEq(ready.sourceWidthMm, 100, "source width preserved");
  assertEq(ready.dxfWidthMm, 100, "dxf width separate");

  const highlights = deriveRoundTripActionHighlights(rows);
  assert(
    !highlights.some((h) => rows[h.rowIndex]?.isReadyForPricing),
    "ready rows no orange"
  );
  assert(
    highlights.some(
      (h) => h.columnKey === "dxfFileName" && !rows[h.rowIndex]?.isReadyForPricing
    ),
    "missing dxf highlights filename"
  );
  console.log("✓ excel export schema + highlights");
}

// Round-trip detect + parse ignores DXF dims / notes
{
  const snapshot = {
    sheets: [
      {
        sheetName: "רשימת פריטים",
        rows: [
          {
            rowNumber: 1,
            cells: OMEGA_ROUND_TRIP_HEADERS.map((h, i) => ({
              address: `A${i}`,
              text: h,
            })),
          },
          {
            rowNumber: 2,
            cells: [
              { text: "p200" },
              { text: "p200.dxf" },
              { text: "S355" },
              { text: "12" },
              { text: "3" },
              { text: "100" },
              { text: "200" },
              { text: "999" },
              { text: "888" },
              { text: "הערה פנימית" },
            ],
          },
        ],
      },
    ],
  };
  assertEq(isOmegaRoundTripWorkbook(snapshot), true, "detect round-trip");
  const parsed = parseOmegaRoundTripWorkbookWithMeta(snapshot, {
    sourceFileName: "rt.xlsx",
  });
  assertEq(parsed.rows.length, 1, "one row parsed");
  assertEq(parsed.rows[0]!.partId, "p200", "part id mapped");
  assertEq(parsed.rows[0]!.widthMm, 100, "source width mapped");
  assertEq(parsed.rows[0]!.lengthMm, 200, "source length mapped");
  assertEq(parsed.ignoredInformationalDxfDimensionCells, 2, "dxf dims ignored");
  assertEq(parsed.ignoredNotesCells, 1, "notes ignored");
  // DXF dims must not become width/length
  assert(parsed.rows[0]!.widthMm !== 999, "no trust excel dxf width");

  // Company footer rows must not be imported as parts
  const withFooter = {
    sheets: [
      {
        sheetName: "רשימת פריטים",
        rows: [
          ...snapshot.sheets[0]!.rows,
          { rowNumber: 3, cells: [{ text: "" }] },
          {
            rowNumber: 4,
            cells: [{ text: "שם החברה" }, { text: "חברת בדיקה" }],
          },
          {
            rowNumber: 5,
            cells: [{ text: "מספר ח.פ" }, { text: "123" }],
          },
          {
            rowNumber: 6,
            cells: [{ text: "כתובת" }, { text: "רחוב 1" }],
          },
          {
            rowNumber: 7,
            cells: [{ text: 'דוא"ל' }, { text: "a@b.com" }],
          },
        ],
      },
    ],
  };
  assertEq(
    parseOmegaRoundTripWorkbook(withFooter).length,
    1,
    "footer rows ignored on re-import"
  );

  const nonOmega = {
    sheets: [
      {
        sheetName: "Sheet1",
        rows: [
          {
            rowNumber: 1,
            cells: [{ text: "חלק" }, { text: "כמות" }],
          },
        ],
      },
    ],
  };
  assertEq(isOmegaRoundTripWorkbook(nonOmega), false, "non-omega not detected");
  assertEq(parseOmegaRoundTripWorkbook(nonOmega).length, 0, "non-omega empty parse");
  console.log("✓ round-trip detect/parse + ignore informational columns");
}

// Session store fast-path present
{
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  assert(store.includes("isOmegaRoundTripWorkbook"), "session detects round-trip");
  assert(
    store.includes("parseOmegaRoundTripWorkbookWithMeta"),
    "session parses round-trip"
  );
  assert(
    store.includes("ROUND_TRIP_DETERMINISTIC_PARSE"),
    "no AI purpose for round-trip"
  );
  console.log("✓ sessionStore round-trip fast path");
}

// Diagnostics + invariants
{
  const rows = buildGapCommunicationRows([readyRow("a", 0)]);
  const diag = await buildGapCommunicationDiagnostics({
    rows,
    quotationName: "t",
  });
  assertEq(diag.exportedSheetCount, 1, "diag sheet count");
  assertEq(diag.exportedStatusColumnCount, 0, "diag no status");
  assertEq(diag.consistencyInvariantPassed, true, "invariants pass");
  assert(
    assertGapCommunicationInvariants({
      rows,
      emailUnresolvedCount: 0,
      excelDataRowCount: 1,
      excelSheetCount: 1,
      excelStatusColumnCount: 0,
      heuristicDxfAssignmentsInReport: 0,
      roundTripImportedDxfDimensionsFromExcel: 0,
    }),
    "manual invariant"
  );
  console.log("✓ diagnostics + invariants");
}

console.log("\nAll gap-communication / round-trip v1 checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
