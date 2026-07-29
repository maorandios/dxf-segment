/**
 * OMEGA — Final Quote List Corrections and Scope Guard v2
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-final-quote-list-v2.ts
 *
 * Note: finish is single-select as of Behavior Corrections v3; v2 multi-select
 * assertions were updated to the scalar finish model.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveFinalQuoteListAccessDecision,
  canApproveFinalQuoteList,
} from "../deriveFinalQuoteListAccessDecision";
import type { DxfFileFinding } from "../dxfFileFindings";
import {
  defaultQuoteItemCommercialOptions,
  formatFinishLabelHe,
  formatCheckeredPlateExportHe,
  hydrateQuoteItemCommercialOptions,
  normalizeQuoteItemFinish,
} from "../quoteItemCommercialOptions";
import {
  compareQuotePartIds,
  filterFinalQuoteListBySearch,
  orderFinalQuoteListRows,
  buildFinalQuoteListV2Diagnostics,
  buildApprovedQuotePricingPayload,
} from "../results";
import { FINAL_QUOTE_EXCEL_HEADERS as EXCEL_HEADERS } from "../results/buildFinalQuoteExcelWorkbook";
import {
  REVIEW_WORKSPACE_CONTENT_MAX_PX,
  REVIEW_WORKSPACE_WIDTH_TOKEN,
} from "../ui/ReviewWorkspaceContainer";
import type { FinalIntakeRow } from "../results/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function assert_(cond: unknown, msg: string): asserts cond {
  assert.ok(cond, msg);
}

function baseRow(
  partial: Partial<FinalIntakeRow> &
    Pick<FinalIntakeRow, "id" | "materialRowId" | "status">
): FinalIntakeRow {
  return {
    reviewStatus: partial.status,
    part: {
      displayName: partial.part?.displayName ?? "5P71",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partial.part?.sourcePartId ?? "5P71",
      sourceProfile: null,
      matchedDxfId: partial.part?.matchedDxfId ?? "dxf-1",
      matchedDxfPartId: null,
      matchedDxfFilename: partial.part?.matchedDxfFilename ?? "5P71.dxf",
    },
    preview: { dxfId: "dxf-1", geometryAvailable: true },
    material: partial.material ?? "S355",
    thicknessMm: 10,
    quantity: partial.quantity ?? 1,
    dxfDimensions: { widthMm: 100, lengthMm: 200 },
    commercial: {
      areaM2: 0.02,
      unitWeightKg: 1.57,
      totalWeightKg: 1.57,
    },
    source: {
      workbookFilename: "w.xlsx",
      sheetName: "S",
      sourceRow: 1,
      sourceCell: "A1",
      sourceText: null,
      sourceWidthMm: 100,
      sourceLengthMm: 200,
      sourceAreaM2: null,
      sourceWeightKg: null,
    },
    issueCodes: partial.issueCodes ?? [],
    primaryMessage: null,
    availableActions: [],
    isManuallyMatched: false,
    isManualMatchConfirmed: true,
    isExcluded: false,
    match: partial.match ?? {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    sourceOrderIndex: partial.sourceOrderIndex ?? 0,
    dimensionComparison: null,
    rawDxfDimensions: { widthMm: 100, lengthMm: 200 },
    dimensionMismatchResolution: null,
    scopeState: "INCLUDED",
    frozenAt: null,
    isFrozen: false,
    ...partial,
  } as FinalIntakeRow;
}

function ready(id: string, partId: string, order: number): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId: id,
    status: "READY",
    sourceOrderIndex: order,
    part: {
      displayName: partId,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partId,
      sourceProfile: null,
      matchedDxfId: `dxf-${id}`,
      matchedDxfPartId: null,
      matchedDxfFilename: `${partId}.dxf`,
    },
  });
}

function gapRow(
  id: string,
  partId: string,
  order: number,
  issueCodes: string[]
): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId: id,
    status: "NEEDS_REVIEW",
    sourceOrderIndex: order,
    issueCodes: issueCodes as FinalIntakeRow["issueCodes"],
    match: {
      status: "UNMATCHED",
      method: null,
      candidates: [],
      message: null,
    },
    part: {
      displayName: partId,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partId,
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
    material: null,
    thicknessMm: null,
  });
}

console.log("OMEGA — Final Quote List Corrections and Scope Guard v2");

{
  const container = fs.readFileSync(
    path.join(root, "ui/ReviewWorkspaceContainer.tsx"),
    "utf8"
  );
  const gap = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  const screen = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );
  const table = fs.readFileSync(
    path.join(root, "results/FinalQuoteListTable.tsx"),
    "utf8"
  );
  assert_(container.includes("REVIEW_WORKSPACE_CONTENT_MAX_PX = 1200"), "width token");
  assertEq(REVIEW_WORKSPACE_CONTENT_MAX_PX, 1200, "shared max px");
  assert_(gap.includes("REVIEW_WORKSPACE_CONTENT_MAX_PX"), "gap uses token");
  assert_(gap.includes("REVIEW_WORKSPACE_WIDTH_TOKEN"), "gap width attr");
  assertEq(
    REVIEW_WORKSPACE_WIDTH_TOKEN,
    "REVIEW_WORKSPACE_CONTENT_MAX_PX:1200",
    "token string"
  );
  assert_(screen.includes("ReviewWorkspaceContainer"), "final uses container");
  assert_(!table.includes("משויך ל-DXF"), "DXF column removed");
  assert_(table.includes('label="גימור"'), "finish col");
  assert_(table.includes('label="פח מרוג"'), "checkered col");
  console.log("✓ width + table schema");
}

{
  const opts = defaultQuoteItemCommercialOptions();
  assertEq(opts.finish, "BLACK", "default black");
  assertEq(opts.isCheckeredPlate, false, "default unchecked");
  assertEq(normalizeQuoteItemFinish(["BLACK", "GALVANIZED"]), "BLACK", "no multi");
  assertEq(formatFinishLabelHe("GALVANIZED"), "מגולוון", "galv label");
  assertEq(formatCheckeredPlateExportHe(true), "כן", "checkered yes");
  const hydrated = hydrateQuoteItemCommercialOptions(undefined);
  assertEq(hydrated.finish, "BLACK", "hydrate default");
  console.log("✓ finish + checkered defaults/controls");
}

{
  const rows = [
    ready("a", "5P1", 0),
    ready("b", "5P10", 1),
    ready("c", "5P2", 2),
    ready("d", "5P100", 3),
    ready("e", "5P71", 4),
  ];
  const ordered = orderFinalQuoteListRows(rows);
  const ids = ordered.map((r) => r.part.sourcePartId);
  assertEq(ids.join(","), "5P1,5P2,5P10,5P71,5P100", "natural A-Z");
  assert_(compareQuotePartIds(ready("a", "5P2", 0), ready("b", "5P10", 1)) < 0, "5P2 < 5P10");

  const withFrozen = [
    ready("a", "5P69", 0),
    ready("b", "5P70", 1),
    {
      ...ready("rf", "5P71", 2),
      scopeState: "FROZEN" as const,
      isFrozen: true,
    },
    ready("d", "5P72", 3),
    ready("e", "5P73", 4),
  ];
  const orderedF = orderFinalQuoteListRows(withFrozen);
  const frozenMid = orderedF.findIndex((r) => r.id === "rf");
  assertEq(frozenMid, 2, "frozen stays in natural place");

  const searched = filterFinalQuoteListBySearch(withFrozen, "5P7");
  assert_(
    searched.every(
      (row, i) =>
        i === 0 || compareQuotePartIds(searched[i - 1]!, searched[i]!) <= 0
    ),
    "search keeps natural order"
  );
  console.log("✓ natural sort + freeze position");
}

{
  const readyA = ready("a", "5P71", 0);
  const blocking = gapRow("b", "5P72", 1, ["NO_DXF_FOUND"]);
  const frozenGap = {
    ...gapRow("c", "5P73", 2, ["MISSING_MATERIAL"]),
    scopeState: "FROZEN" as const,
    isFrozen: true,
  };

  const blocked = deriveFinalQuoteListAccessDecision([readyA, blocking], []);
  assertEq(blocked.canAccess, false, "active ID gap blocks");
  assertEq(blocked.activeBlockingMaterialRowCount, 1, "count");

  const ok = deriveFinalQuoteListAccessDecision([readyA, frozenGap], []);
  assertEq(ok.canAccess, true, "frozen gap does not block");
  assertEq(ok.activeReadyRowCount, 1, "ready count");

  const findingActive: DxfFileFinding = {
    id: "f1",
    type: "INVALID_DXF",
    severity: "BLOCKING",
    dxfIds: ["dxf-a"],
    title: "bad",
    description: "5P71 file invalid",
  };
  const withActiveFinding = deriveFinalQuoteListAccessDecision(
    [readyA],
    [findingActive]
  );
  assertEq(withActiveFinding.canAccess, false, "active DXF blocks");

  const findingFrozenOnly: DxfFileFinding = {
    id: "f2",
    type: "INVALID_DXF",
    severity: "BLOCKING",
    dxfIds: ["dxf-frozen"],
    title: "bad frozen",
    description: "5P99 file invalid",
  };
  const frozenRow = {
    ...ready("c", "5P99", 0),
    scopeState: "FROZEN" as const,
    isFrozen: true,
    part: {
      ...ready("c", "5P99", 0).part,
      matchedDxfId: "dxf-frozen",
      matchedDxfFilename: "5P99.dxf",
    },
  };
  const onlyFrozenFinding = deriveFinalQuoteListAccessDecision(
    [readyA, frozenRow],
    [findingFrozenOnly]
  );
  assertEq(onlyFrozenFinding.canAccess, true, "frozen-only DXF does not block");

  const unref: DxfFileFinding = {
    id: "u",
    type: "UNREFERENCED_DXF",
    severity: "INFO",
    dxfIds: ["x"],
    title: "u",
    description: "u",
  };
  assertEq(
    deriveFinalQuoteListAccessDecision([readyA], [unref]).canAccess,
    true,
    "info unref ok"
  );

  assertEq(
    canApproveFinalQuoteList({ access: ok, activeRowCount: 1 }),
    true,
    "approve ok"
  );
  assertEq(
    canApproveFinalQuoteList({ access: blocked, activeRowCount: 1 }),
    false,
    "approve blocked"
  );

  const toolbar = fs.readFileSync(
    path.join(root, "workflow/GapWorkspaceToolbar.tsx"),
    "utf8"
  );
  assert_(toolbar.includes("המשך לרשימה להצעת מחיר"), "continue label");
  assert_(!toolbar.includes("continueDisabled"), "v3: continue not disabled prop");
  console.log("✓ access selector + progression guards");
}

{
  const a = ready("a", "5P71", 0);
  const payload = buildApprovedQuotePricingPayload(
    [a],
    { a: { finish: "GALVANIZED", isCheckeredPlate: true } }
  );
  assertEq(payload[0]!.finish, "GALVANIZED", "finish");
  assertEq(payload[0]!.isCheckeredPlate, true, "checkered");
  assert_(EXCEL_HEADERS.includes("גימור"), "excel finish");
  assert_(EXCEL_HEADERS.includes("פח מרוג"), "excel checkered");
  assert_(!EXCEL_HEADERS.includes("משויך ל-DXF" as never), "no dxf col excel");

  const access = deriveFinalQuoteListAccessDecision([a], []);
  const diag = buildFinalQuoteListV2Diagnostics({
    rows: [a],
    access,
    canApproveList: true,
    commercialOptions: {
      a: { finish: "GALVANIZED", isCheckeredPlate: true },
    },
  });
  assertEq(diag.frozenRowsMovedAfterToggle, 0, "inv position");
  assertEq(diag.assignedDxfColumnRendered, false, "inv dxf col");
  assertEq(diag.containerWidthMatchesGapScreen, true, "inv width");
  console.log("✓ payload + diagnostics invariants");
}

console.log("\nOMEGA — Final Quote List Corrections and Scope Guard v2 — all checks passed.");
