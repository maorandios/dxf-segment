/**
 * OMEGA — Freeze and Restore Material Rows v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-freeze-restore-material-rows-v1.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DxfFileFinding } from "../dxfFileFindings";
import {
  buildGapCommunicationRows,
  buildGapEmailDraft,
  OMEGA_ROUND_TRIP_HEADERS,
} from "../gapCommunication";
import {
  buildFreezeScopeDiagnostics,
  isBlockingDxfFindingForActiveScope,
  isQuoteItemActive,
  isQuoteItemFrozen,
  selectActiveActionableGapItems,
  selectActiveQuoteItems,
  selectFrozenQuoteItems,
} from "../quoteItemScope";
import {
  buildGapResolutionSummary,
  deriveMaterialResolutionCategory,
  filterItemsByResolutionCategory,
} from "../results/primaryResolutionCategory";
import { filterFinalRows } from "../results/filterFinalRows";
import { summarizeFinalRows } from "../results/deriveFinalRows";
import type { FinalIntakeRow } from "../results/types";
import { deriveActionableGapDecision } from "../postAnalysisRouting";
import {
  getSimpleIntakeSession,
  simpleIntakeActions,
} from "../sessionStore";

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
    material: partial.material ?? null,
    thicknessMm: partial.thicknessMm ?? null,
    quantity: partial.quantity ?? 2,
    dxfDimensions: partial.dxfDimensions ?? { widthMm: null, lengthMm: null },
    commercial: {
      areaM2: partial.commercial?.areaM2 ?? 0.5,
      unitWeightKg: partial.commercial?.unitWeightKg ?? 10,
      totalWeightKg: partial.commercial?.totalWeightKg ?? 20,
    },
    source: {
      workbookFilename: "w.xlsx",
      sheetName: "S",
      sourceRow: 1,
      sourceCell: "A1",
      sourceText: null,
      sourceWidthMm: partial.source?.sourceWidthMm ?? null,
      sourceLengthMm: partial.source?.sourceLengthMm ?? null,
      sourceAreaM2: null,
      sourceWeightKg: null,
    },
    primaryMessage: null,
    availableActions: [],
    isManuallyMatched: false,
    isManualMatchConfirmed: false,
    isExcluded: false,
    match: partial.match ?? {
      status: "UNMATCHED",
      method: null,
      candidates: [],
      message: null,
    },
    sourceOrderIndex: partial.sourceOrderIndex ?? 0,
    dimensionComparison: null,
    rawDxfDimensions: { widthMm: null, lengthMm: null },
    dimensionMismatchResolution: null,
    scopeState: "INCLUDED",
    frozenAt: null,
    isFrozen: false,
    ...partial,
  } as FinalIntakeRow;
}

function gapRow(
  id: string,
  materialRowId: string,
  order: number
): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId,
    status: "BLOCKED",
    issueCodes: ["MISSING_MATERIAL", "NO_DXF_FOUND"],
    sourceOrderIndex: order,
    part: {
      displayName: materialRowId,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: materialRowId,
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
  });
}

function readyRow(
  id: string,
  materialRowId: string,
  order: number
): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId,
    status: "READY",
    issueCodes: [],
    sourceOrderIndex: order,
    material: "S355",
    thicknessMm: 10,
    quantity: 3,
    part: {
      displayName: materialRowId,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: materialRowId,
      sourceProfile: null,
      matchedDxfId: `dxf-${materialRowId}`,
      matchedDxfPartId: materialRowId,
      matchedDxfFilename: `${materialRowId}.dxf`,
    },
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    preview: { dxfId: `dxf-${materialRowId}`, geometryAvailable: true },
    dxfDimensions: { widthMm: 100, lengthMm: 200 },
    source: {
      workbookFilename: "w.xlsx",
      sheetName: "S",
      sourceRow: order + 1,
      sourceCell: "A1",
      sourceText: null,
      sourceWidthMm: 100,
      sourceLengthMm: 200,
      sourceAreaM2: null,
      sourceWeightKg: null,
    },
  });
}

console.log("OMEGA — Freeze and Restore Material Rows v1");

// —— Source: הקפא column immediately before צפיה (RTL visual-right of צפיה) ——
{
  const src = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  const freezeHdr = src.indexOf('ColHeader label="הקפא"');
  const viewHdr = src.indexOf('ColHeader label="צפיה"');
  assert(freezeHdr > 0 && viewHdr > freezeHdr, "הקפא header before צפיה in DOM");
  assert(src.includes("CirclePause"), "CirclePause icon");
  assert(src.includes("RotateCcw"), "RotateCcw icon");
  assert(src.includes("data-scope-state"), "scope state attr");
  assert(src.includes("toggleQuoteItemFreeze"), "wired toggle");
  assert(src.includes('aria-pressed={frozen}'), "aria-pressed toggle");
  console.log("✓ RTL column placement (הקפא before צפיה in DOM)");
}

// —— Session freeze / restore by materialRowId ——
{
  simpleIntakeActions.reset();
  const before = { ...getSimpleIntakeSession().frozenMaterialRows };
  assertEq(Object.keys(before).length, 0, "starts empty");

  simpleIntakeActions.freezeQuoteItem("MR-5P72");
  const frozenAt = getSimpleIntakeSession().frozenMaterialRows["MR-5P72"];
  assert(typeof frozenAt === "string" && frozenAt.length > 0, "frozenAt set");

  simpleIntakeActions.toggleQuoteItemFreeze("MR-5P72");
  assertEq(
    "MR-5P72" in getSimpleIntakeSession().frozenMaterialRows,
    false,
    "restore clears"
  );

  simpleIntakeActions.toggleQuoteItemFreeze("MR-5P72");
  assertEq(
    "MR-5P72" in getSimpleIntakeSession().frozenMaterialRows,
    true,
    "toggle freeze"
  );
  simpleIntakeActions.restoreQuoteItem("MR-5P72");
  console.log("✓ freeze/restore/toggle keyed by materialRowId");
}

// —— Category stays orthogonal; freeze does not mark READY ——
{
  const row = gapRow("r1", "5P72", 0);
  assertEq(
    deriveMaterialResolutionCategory(row),
    "ITEM_IDENTIFICATION",
    "category before"
  );
  const frozen = {
    ...row,
    scopeState: "FROZEN" as const,
    isFrozen: true,
    frozenAt: "2026-01-01T00:00:00.000Z",
  };
  assertEq(
    deriveMaterialResolutionCategory(frozen),
    "ITEM_IDENTIFICATION",
    "category while frozen"
  );
  assert(isQuoteItemFrozen(frozen), "is frozen");
  assert(!isQuoteItemActive(frozen), "not active");
  console.log("✓ category orthogonal to freeze scope");
}

// —— Visibility + ordering in filtered category ——
{
  const a = gapRow("a", "A", 0);
  const b = {
    ...gapRow("b", "B", 1),
    scopeState: "FROZEN" as const,
    isFrozen: true,
  };
  const c = gapRow("c", "C", 2);
  const filtered = filterItemsByResolutionCategory(
    [a, b, c],
    "ITEM_IDENTIFICATION"
  );
  assertEq(filtered.length, 3, "frozen remains visible");
  assertEq(filtered[0]!.id, "a", "order preserved a");
  assertEq(filtered[1]!.id, "b", "frozen stays in original place");
  assertEq(filtered[2]!.id, "c", "order preserved c");
  console.log("✓ frozen remain visible in original place");
}

// —— Gap counts exclude frozen ——
{
  const rows = [
    gapRow("a", "A", 0),
    {
      ...gapRow("b", "B", 1),
      scopeState: "FROZEN" as const,
      isFrozen: true,
    },
    readyRow("c", "C", 2),
  ];
  const summary = buildGapResolutionSummary(rows);
  assertEq(summary.itemIdentificationCount, 1, "id count excludes frozen");
  assertEq(summary.readyForPricingCount, 1, "ready count");
  assertEq(summary.remainingActionCount, 1, "remaining excludes frozen");
  assertEq(summary.totalMaterialItemCount, 2, "active total");
  assertEq(selectFrozenQuoteItems(rows).length, 1, "frozen selector");
  assertEq(selectActiveActionableGapItems(rows).length, 1, "actionable");
  console.log("✓ gap-card counts exclude frozen");
}

// —— Progression: last unresolved freeze enables continue ——
{
  const only = {
    ...gapRow("only", "ONLY", 0),
  };
  assertEq(buildGapResolutionSummary([only]).remainingActionCount, 1, "blocks");
  const frozen = {
    ...only,
    scopeState: "FROZEN" as const,
    isFrozen: true,
  };
  assertEq(
    buildGapResolutionSummary([frozen]).remainingActionCount,
    0,
    "freeze enables progression"
  );
  const restored = { ...frozen, scopeState: "INCLUDED" as const, isFrozen: false };
  assertEq(
    buildGapResolutionSummary([restored]).remainingActionCount,
    1,
    "restore blocks again"
  );
  const workspace = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  const freezeFn = workspace.indexOf("function handleToggleFreeze");
  const freezeEnd = workspace.indexOf("function requestContinue", freezeFn);
  const freezeBody = workspace.slice(freezeFn, freezeEnd);
  assert(
    !freezeBody.includes("onContinueToTable"),
    "freeze does not auto-navigate"
  );
  console.log("✓ progression + no auto-navigate on freeze");
}

// —— Calculations / final table ——
{
  const active = readyRow("a", "A", 0);
  const frozen = {
    ...readyRow("b", "B", 1),
    scopeState: "FROZEN" as const,
    isFrozen: true,
    quantity: 99,
    commercial: { areaM2: 9, unitWeightKg: 9, totalWeightKg: 99 },
  };
  const s = summarizeFinalRows([active, frozen]);
  assertEq(s.totalUnitCount, 3, "qty excludes frozen");
  assertEq(s.totalRowCount, 1, "row count excludes frozen");
  assertEq(filterFinalRows([active, frozen], "ALL").length, 1, "final ALL");
  assertEq(filterFinalRows([active, frozen], "READY").length, 1, "final READY");
  assert(
    filterFinalRows([active, frozen], "EXCLUDED").some((r) => r.isFrozen),
    "frozen may appear under excluded/audit filter"
  );
  console.log("✓ calculation + final-table exclusions");
}

// —— Email + Excel ——
{
  const rows = [
    gapRow("a", "A", 0),
    {
      ...gapRow("b", "B", 1),
      scopeState: "FROZEN" as const,
      isFrozen: true,
    },
  ];
  const comm = buildGapCommunicationRows(rows);
  assertEq(comm.length, 1, "excel/email projection excludes frozen");
  assertEq(comm[0]!.materialRowId, "A", "active only");
  const email = buildGapEmailDraft({
    quotationName: "Q",
    rows: comm,
    dxfFindings: [],
  });
  assert(!email.body.includes("B"), "email omits frozen part id");
  assert(!OMEGA_ROUND_TRIP_HEADERS.includes("הקפא" as never), "no freeze col");
  assert(
    !OMEGA_ROUND_TRIP_HEADERS.some((h) => /סטטוס|מוקפא|freeze/i.test(h)),
    "no status column"
  );
  console.log("✓ gap email + excel exclude frozen; no freeze column");
}

// —— DXF findings scoped to active ——
{
  const frozenRow = {
    ...readyRow("f", "5P72", 0),
    scopeState: "FROZEN" as const,
    isFrozen: true,
  };
  const activeRow = readyRow("a", "5P71", 1);
  const findingOnlyFrozen: DxfFileFinding = {
    id: "inv-frozen",
    type: "INVALID_DXF",
    severity: "BLOCKING",
    dxfIds: ["dxf-5P72"],
    title: "invalid 5P72",
    description: "5P72.dxf invalid",
  };
  const findingActive: DxfFileFinding = {
    id: "inv-active",
    type: "INVALID_DXF",
    severity: "BLOCKING",
    dxfIds: ["dxf-5P71"],
    title: "invalid 5P71",
    description: "5P71.dxf invalid",
  };
  const unref: DxfFileFinding = {
    id: "u",
    type: "UNREFERENCED_DXF",
    severity: "INFO",
    dxfIds: ["dxf-5P72"],
    title: "unref",
    description: "unused",
  };
  assertEq(
    isBlockingDxfFindingForActiveScope(findingOnlyFrozen, [frozenRow, activeRow]),
    false,
    "frozen-only DXF does not block"
  );
  assertEq(
    isBlockingDxfFindingForActiveScope(findingActive, [frozenRow, activeRow]),
    true,
    "active DXF still blocks"
  );
  assertEq(
    isBlockingDxfFindingForActiveScope(unref, [frozenRow]),
    false,
    "unref never blocks"
  );
  const decision = deriveActionableGapDecision(
    [frozenRow],
    [findingOnlyFrozen]
  );
  assertEq(decision.hasActionableGaps, false, "routing ignores frozen-only");
  console.log("✓ active-scope DXF finding behavior");
}

// —— Diagnostics invariants ——
{
  const rows = [
    gapRow("a", "A", 0),
    {
      ...gapRow("b", "B", 1),
      scopeState: "FROZEN" as const,
      isFrozen: true,
    },
  ];
  const active = selectActiveQuoteItems(rows);
  const diag = buildFreezeScopeDiagnostics({
    rows,
    gapEmailRowCount: selectActiveActionableGapItems(rows).length,
    excelRowCount: active.length,
    calculationRowCount: active.length,
    dxfFindings: [],
  });
  assertEq(diag.frozenRowsIncludedInGapCounts, 0, "inv gap counts");
  assertEq(diag.frozenRowsIncludedInCalculations, 0, "inv calc");
  assertEq(diag.frozenRowsIncludedInGapEmail, 0, "inv email");
  assertEq(diag.frozenRowsIncludedInRoundTripExcel, 0, "inv excel");
  assertEq(diag.blockingDxfFindingsAffectingOnlyFrozenRows, 0, "inv dxf");
  assertEq(diag.canOpenFinalTable, false, "still one active gap");
  const allFrozen = rows.map((r) => ({
    ...r,
    scopeState: "FROZEN" as const,
    isFrozen: true,
  }));
  const open = buildFreezeScopeDiagnostics({
    rows: allFrozen,
    gapEmailRowCount: 0,
    excelRowCount: 0,
    calculationRowCount: 0,
    dxfFindings: [],
  });
  assertEq(open.canOpenFinalTable, true, "all frozen → can open");
  console.log("✓ freezeScopeDiagnostics invariants");
}

// —— Persistence map on session; no rematch on freeze ——
{
  const storeSrc = fs.readFileSync(
    path.join(root, "sessionStore.ts"),
    "utf8"
  );
  const freezeBlock = storeSrc.slice(
    storeSrc.indexOf("freezeQuoteItem(materialRowId"),
    storeSrc.indexOf("updateRowEdits(")
  );
  assert(freezeBlock.includes("frozenMaterialRows"), "persists on session");
  assert(!/rematch|parseDxf|analyze|extract/i.test(freezeBlock), "no rematch");
  assert(
    storeSrc.includes('frozenMaterialRows: {}'),
    "empty in createEmptySession"
  );
  console.log("✓ persistence + no rematch/parse/extract on freeze");
}

// —— Restore recovers gap immediately ——
{
  const before = gapRow("x", "X", 0);
  const category = deriveMaterialResolutionCategory(before);
  const afterFreeze = {
    ...before,
    scopeState: "FROZEN" as const,
    isFrozen: true,
    material: before.material,
    part: { ...before.part },
    issueCodes: [...before.issueCodes],
  };
  const afterRestore = {
    ...afterFreeze,
    scopeState: "INCLUDED" as const,
    isFrozen: false,
    frozenAt: null,
  };
  assertEq(deriveMaterialResolutionCategory(afterRestore), category, "same cat");
  assertEq(
    buildGapResolutionSummary([afterRestore]).remainingActionCount,
    1,
    "gap restored"
  );
  assertEq(afterRestore.issueCodes.join(","), before.issueCodes.join(","), "issues");
  assertEq(afterRestore.part.matchedDxfId, before.part.matchedDxfId, "dxf kept");
  console.log("✓ restore recovers previous gap + data");
}

console.log("\nOMEGA — Freeze and Restore Material Rows v1 — all checks passed.");
