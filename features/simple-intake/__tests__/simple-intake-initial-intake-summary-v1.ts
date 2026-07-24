/**
 * OMEGA — Initial Intake Summary Redesign and Notice Fix v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-initial-intake-summary-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApprovalStatus } from "../materialList/completeness";
import { adaptMaterialListRows } from "../materialList/adaptMaterialListRows";
import { adaptPdfMaterialListRows } from "../materialList/adaptPdfMaterialListRows";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import type { MaterialListRow } from "../materialList/types";
import { buildDxfLinkedMaterialItems } from "../dxfLink/buildDxfLinkedItems";
import {
  buildFilenameFlowDiagnostics,
  buildInitialIntakeNotices,
  buildInitialIntakeSummary,
  filterInitialIntakeNotices,
} from "../buildInitialIntakeSummary";
import { getEffectiveSourceDxfFileName } from "../getExplicitDxfFileName";
import { matchWithFilenamePriority } from "../matchWithFilenamePriority";
import { normalizeDxfFileKey } from "../normalizeDxfFileKey";
import type { SimpleDxfPart } from "../types";

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
    userOverrides: partial.userOverrides ?? {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  const contentHash =
    partial.contentHash !== undefined
      ? partial.contentHash
      : (partial.fingerprint ?? `hash:${partial.id}`);
  return {
    id: partial.id,
    filename: partial.filename,
    partId: partial.partId ?? partial.filename.replace(/\.dxf$/i, ""),
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    areaMm2: partial.areaMm2 ?? 20000,
    geometryStatus: partial.geometryStatus ?? "VALID",
    error: partial.error ?? null,
    fingerprint: partial.fingerprint ?? contentHash,
    contentHash,
    normalizedFilenameKey:
      partial.normalizedFilenameKey ?? normalizeDxfFileKey(partial.filename),
  };
}

function linkedFrom(rows: MaterialListRow[], parts: SimpleDxfPart[]) {
  const matched = matchWithFilenamePriority({
    extractedRows: materialListToExtractedRows(rows),
    dxfParts: parts,
  });
  return buildDxfLinkedMaterialItems({
    materialListRows: rows,
    resultRows: matched.resultRows,
    dxfParts: parts,
  });
}

console.log("=== Initial Intake Summary Redesign and Notice Fix v1 ===\n");

{
  const notReady = buildInitialIntakeSummary({
    unifiedItems: [],
    dxfParts: [],
    ready: false,
  });
  assertEq(notReady.ready, false, "not ready");
  assertEq(buildInitialIntakeNotices(notReady).length, 0, "no notices while loading");
  assertEq(
    filterInitialIntakeNotices(notReady, [
      {
        kind: "NO_EXPLICIT_FILENAMES",
        severity: "serious",
        headingHe: "x",
      },
    ]).length,
    0,
    "filter hides notices when not ready"
  );
  console.log("✓ Screen waits until canonical unified data is ready");
}

{
  const rows = Array.from({ length: 74 }, (_, i) =>
    materialRow({
      rowId: `r${i + 1}`,
      sourceRow: i + 1,
      dxfFileName: `PART-${String(i + 1).padStart(3, "0")}.dxf`,
    })
  );
  const shared = "sha256:same";
  const parts: SimpleDxfPart[] = [];
  for (let i = 1; i <= 71; i++) {
    parts.push(
      dxf({
        id: `d${i}`,
        filename: `PART-${String(i).padStart(3, "0")}.dxf`,
        contentHash: i === 1 ? shared : `sha256:u-${i}`,
      })
    );
  }
  parts.push(
    dxf({ id: "dup", filename: "PART-001-copy.dxf", contentHash: shared })
  );
  const linked = linkedFrom(rows, parts);
  assertEq(linked.length, 74, "unified items");

  const summary = buildInitialIntakeSummary({
    unifiedItems: linked,
    dxfParts: parts,
    ready: true,
  });

  assertEq(summary.material.itemCount, 74, "from unified items");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 74, "source names");
  assertEq(summary.material.filenameCoverage, "FULL", "FULL");
  assertEq(summary.uploads.physicalFileCount, 72, "physical");
  assertEq(summary.uploads.uniqueContentFileCount, 71, "unique content");
  assertEq(summary.uploads.exactDuplicateFileCount, 1, "exact dup");
  assertEq(summary.references.uploadedReferencedFilenameCount, 71, "refs found");
  assertEq(summary.references.missingReferencedFilenameCount, 3, "missing");

  const notices = filterInitialIntakeNotices(
    summary,
    buildInitialIntakeNotices(summary)
  );
  assert(
    !notices.some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "FULL hides no-filenames"
  );
  assert(
    notices.some((n) => n.kind === "EXPLICIT_FILES_MISSING"),
    "missing aggregate"
  );
  assert(
    !notices.some((n) => n.kind === "DUPLICATE_CONTENT_FILES" as never),
    "dup not in serious banners"
  );

  const diag = buildFilenameFlowDiagnostics({
    summary,
    canonicalRows: rows,
    unifiedItems: linked,
  });
  assertEq(diag.noticeConditionResult, false, "notice condition false");
  assertEq(diag.unifiedItemsWithSourceDxfFilename, 74, "unified with names");
  console.log("✓ FULL coverage + metrics + no false notice");
}

{
  const rows = [
    materialRow({ rowId: "a", dxfFileName: "ONLY.dxf" }),
    materialRow({ rowId: "b", dxfFileName: null }),
  ];
  const linked = linkedFrom(rows, [dxf({ id: "d", filename: "ONLY.dxf" })]);
  const summary = buildInitialIntakeSummary({
    unifiedItems: linked,
    dxfParts: [dxf({ id: "d", filename: "ONLY.dxf" })],
    ready: true,
  });
  assertEq(summary.material.filenameCoverage, "PARTIAL", "partial");
  const notices = filterInitialIntakeNotices(
    summary,
    buildInitialIntakeNotices(summary)
  );
  assert(
    notices.some((n) => n.kind === "PARTIAL_FILENAME_COVERAGE"),
    "partial notice"
  );
  assert(
    !notices.some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "no NONE when partial"
  );
  console.log("✓ PARTIAL shows one aggregate notice");
}

{
  const rows = [
    materialRow({ rowId: "a", dxfFileName: null }),
    materialRow({ rowId: "b", dxfFileName: "  " }),
  ];
  const linked = linkedFrom(rows, []);
  const summary = buildInitialIntakeSummary({
    unifiedItems: linked,
    dxfParts: [],
    ready: true,
  });
  assertEq(summary.material.filenameCoverage, "NONE", "none");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 0, "zero");
  const notices = filterInitialIntakeNotices(
    summary,
    buildInitialIntakeNotices(summary)
  );
  assert(
    notices.some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "NONE notice"
  );
  console.log("✓ NONE shows no-filenames notice");
}

{
  // Positive count prevents notice even if coverage mis-labeled (defensive)
  const summary = buildInitialIntakeSummary({
    unifiedItems: linkedFrom(
      [materialRow({ rowId: "x", dxfFileName: "A.dxf" })],
      [dxf({ id: "d", filename: "A.dxf" })]
    ),
    dxfParts: [dxf({ id: "d", filename: "A.dxf" })],
    ready: true,
  });
  assert(
    summary.material.rowsWithExplicitSourceFilename > 0,
    "positive count"
  );
  assertEq(
    filterInitialIntakeNotices(summary, [
      {
        kind: "NO_EXPLICIT_FILENAMES",
        severity: "serious",
        headingHe: "לא נמצאו שמות קובצי DXF ברשימת החומר",
      },
    ]).length,
    0,
    "defensive filter"
  );
  console.log("✓ Any positive explicit count prevents no-filenames notice");
}

{
  // Shared selector: unified item with snapshot, empty material field
  const material = materialRow({ rowId: "lost", dxfFileName: null });
  const linked = buildDxfLinkedMaterialItems({
    materialListRows: [material],
    resultRows: [
      {
        resultRowId: "r",
        extracted: {
          ...materialListToExtractedRows([
            materialRow({ rowId: "lost", dxfFileName: "RECOVERED.dxf" }),
          ])[0]!,
          dxfFileName: "RECOVERED.dxf",
        },
        match: {
          status: "UNMATCHED",
          method: "EXPLICIT_FILENAME",
          matchedDxfId: null,
          candidates: [],
          message: "MISSING_EXPLICIT_DXF:RECOVERED.dxf",
        },
        status: "NEEDS_DXF",
        excluded: false,
        edits: {},
      },
    ],
    dxfParts: [],
  });
  assertEq(
    getEffectiveSourceDxfFileName(linked[0]!),
    "RECOVERED.dxf",
    "shared selector on unified item"
  );
  assertEq(
    getEffectiveSourceDxfFileName(linked[0]!),
    linked[0]!.extractedDxfFileName,
    "same as table source field"
  );
  const summary = buildInitialIntakeSummary({
    unifiedItems: linked,
    dxfParts: [],
    ready: true,
  });
  assertEq(summary.material.rowsWithExplicitSourceFilename, 1, "counts source");
  assertEq(summary.material.filenameCoverage, "FULL", "not NONE");
  assert(
    !filterInitialIntakeNotices(
      summary,
      buildInitialIntakeNotices(summary)
    ).some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "no false notice when unified has source name"
  );
  console.log("✓ Summary uses same shared selector as unified table");
}

{
  const rows = [materialRow({ rowId: "h", dxfFileName: null, widthMm: 50, lengthMm: 50 })];
  const parts = [
    dxf({ id: "d", filename: "assigned.dxf", widthMm: 50, lengthMm: 50 }),
  ];
  const linked = linkedFrom(rows, parts);
  assertEq(getEffectiveSourceDxfFileName(linked[0]!), null, "no source invented");
  const summary = buildInitialIntakeSummary({
    unifiedItems: linked,
    dxfParts: parts,
    ready: true,
  });
  assertEq(summary.material.filenameCoverage, "NONE", "heuristic ≠ source");
  console.log("✓ Assigned / heuristic does not count as source filename");
}

{
  const adapted = adaptMaterialListRows({
    rows: [
      {
        sheetName: "S",
        sourceRow: 2,
        sourceCell: "A2",
        partId: "P1",
        profile: "PL10*100",
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 1,
        widthMm: 100,
        lengthMm: 200,
        dxfFileName: "A3B1-P35.dxf",
      },
    ],
  });
  assertEq(adapted.rows[0]!.dxfFileName, "A3B1-P35.dxf", "excel");
  console.log("✓ Excel extraction regression passes");
}

{
  const adapted = adaptPdfMaterialListRows({
    sourceFileName: "list.pdf",
    result: {
      rows: [
        {
          sourceType: "PDF",
          sourceFileName: "list.pdf",
          sourcePage: 1,
          sourceAnchorText: "row1",
          partId: "P1",
          profile: null,
          description: null,
          material: "S355",
          thicknessMm: 10,
          quantity: 1,
          widthMm: 100,
          lengthMm: 200,
          dxfFileName: "part-a.dxf",
        },
      ],
    },
  });
  assertEq(adapted.rows[0]!.dxfFileName, "part-a.dxf", "pdf");
  console.log("✓ PDF extraction regression passes");
}

{
  const matched = matchWithFilenamePriority({
    extractedRows: materialListToExtractedRows([
      materialRow({ rowId: "r1", dxfFileName: "Target.dxf", widthMm: 10, lengthMm: 10 }),
    ]),
    dxfParts: [
      dxf({ id: "d1", filename: "Target.dxf", widthMm: 99, lengthMm: 99 }),
      dxf({ id: "d2", filename: "geom.dxf", widthMm: 10, lengthMm: 10 }),
    ],
  });
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "d1", "exact first");
  console.log("✓ DXF matcher regression passes");
}

{
  const root = path.resolve(__dirname, "..");
  const screen = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialIntakeSummaryScreen.tsx"),
    "utf8"
  );
  const analysis = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialAnalysisSummary.tsx"),
    "utf8"
  );
  const next = fs.readFileSync(
    path.join(root, "workflow/initialIntake/UnifiedReviewNextSteps.tsx"),
    "utf8"
  );
  const action = fs.readFileSync(
    path.join(root, "workflow/initialIntake/UnifiedReviewActionPanel.tsx"),
    "utf8"
  );
  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );

  assert(analysis.includes("רשימת החומר"), "material section");
  assert(analysis.includes("קובצי DXF"), "uploads section");
  assert(
    analysis.includes("דורש בדיקה") || analysis.includes("דורש טיפול"),
    "attention section"
  );
  assert(!analysis.includes("פערים ראשוניים"), "old gaps removed");
  assert(!screen.includes("מידות"), "no dim mismatch");
  assert(!screen.includes("התאמות מוצעות"), "no suggested");
  assert(!screen.includes("AMBIGUOUS"), "no candidates");
  assert(next.includes("ייצוא") || next.includes("טבלת הבדיקה"), "help content exists");
  assert(action.includes("אינה מאפסת") || action.includes("אינה מאשרת"), "no approve reassurance");
  assert(action.includes("פתח טבלת בדיקה מאוחדת"), "primary CTA");
  assert(action.includes("חזרה להעלאת DXF"), "secondary nav");
  assert(workflow.includes("InitialIntakeSummaryScreen"), "wired");
  assert(
    workflow.includes("buildIntakeAnalysisSummary") ||
      workflow.includes("buildInitialIntakeSummary"),
    "from analysis"
  );
  assert(workflow.includes("unifiedItemsCreated"), "readiness");
  assert(workflow.includes("setView(\"TABLE\")"), "opens table");
  assert(!workflow.includes("approveMaterial"), "no approve on open");
  console.log("✓ Visual structure, next steps, action panel, wiring");
}

console.log(
  "\n=== Initial Intake Summary Redesign and Notice Fix v1 passed ==="
);
