/**
 * OMEGA Simple Intake — Generic Issue Action Cards and Defer Workflow v1.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-issue-cards-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import { deriveFinalRows } from "../results/deriveFinalRows";
import { FIXED_TABLE_COLUMN_HEADERS } from "../results/tableContract";
import type { FinalIntakeRow } from "../results/types";
import {
  ISSUE_PRESENTATIONS,
  makeDeferredKey,
  presentationForCode,
  toCriticalIssueCode,
} from "../readiness/issuePresentation";
import {
  orderedCriticalCodes,
  pickPrimaryIssueCode,
  pruneDeferredKeys,
} from "../readiness/pickPrimaryIssue";
import type {
  SimpleDxfPart,
  SimpleExtractedRow,
  SimpleResultRow,
} from "../types";

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

function extracted(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    sheetName: "S1",
    sourceRow: 2,
    sourceCell: "A2",
    partId: null,
    profile: "PL6X32",
    description: null,
    quantity: 2,
    material: "S355",
    thicknessMm: 6,
    widthMm: 32,
    lengthMm: 447,
    sourceAreaM2: null,
    sourceWeightKg: null,
    confidence: 0.9,
    note: null,
    warnings: [],
    ...partial,
  };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; partId: string }
): SimpleDxfPart {
  return {
    filename: `${partial.partId}.dxf`,
    widthMm: 32,
    lengthMm: 447,
    areaMm2: 14304,
    geometryStatus: "VALID",
    error: null,
    fingerprint: null,
    ...partial,
  };
}

function resultRow(
  partial: Partial<SimpleResultRow> & {
    resultRowId: string;
    extracted: SimpleExtractedRow;
  }
): SimpleResultRow {
  return {
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
    ...partial,
  };
}

function derive(rows: SimpleResultRow[], parts: SimpleDxfPart[]): FinalIntakeRow[] {
  return deriveFinalRows({
    resultRows: rows,
    dxfParts: parts,
    workbookFilename: "mat.xlsx",
    snapshot: null,
    diagnostics: null,
    confirmedManualMatchIds: new Set(),
  });
}

function run(): void {
  console.log("=== Generic Issue Action Cards and Defer Workflow v1 ===\n");

  const part = dxf({ id: "d1", partId: "P1" });

  // Registry actions per issue
  {
    const qty = ISSUE_PRESENTATIONS.MISSING_QUANTITY;
    assertEq(qty.primaryAction, "EDIT_QUANTITY", "qty primary");
    assertEq(qty.secondaryActions.length, 0, "qty no dxf actions");
    assert(qty.allowDefer, "qty defer");

    const mat = ISSUE_PRESENTATIONS.MISSING_MATERIAL;
    assertEq(mat.primaryAction, "EDIT_MATERIAL", "mat");
    assertEq(mat.secondaryActions.length, 0, "mat no dxf");

    const thk = ISSUE_PRESENTATIONS.MISSING_THICKNESS;
    assertEq(thk.primaryAction, "EDIT_THICKNESS", "thk");

    const dims = ISSUE_PRESENTATIONS.MISSING_REQUIRED_DIMENSIONS;
    assertEq(dims.primaryAction, "EDIT_DIMENSIONS", "dims");
    assert(dims.primaryLabel.includes("שמור"), "dims label");

    const no = ISSUE_PRESENTATIONS.NO_DXF_FOUND;
    assertEq(no.primaryAction, "SELECT_DXF", "no dxf select");
    assert(no.secondaryActions.includes("UPLOAD_DXF"), "upload secondary");
    assert(no.allowExclude, "exclude");

    const multi = ISSUE_PRESENTATIONS.MULTIPLE_DXF_CANDIDATES;
    assertEq(multi.primaryAction, "COMPARE_DXF", "compare");

    const inv = ISSUE_PRESENTATIONS.DXF_INVALID;
    assertEq(inv.primaryAction, "REPLACE_DXF", "replace");
    assert(inv.secondaryActions.includes("SELECT_DXF"), "select other");

    const conflict = ISSUE_PRESENTATIONS.DXF_ASSIGNMENT_CONFLICT;
    assertEq(conflict.title, "חסר DXF לשורה הזו", "conflict wording");
    assert(
      !conflict.explanation.includes("משויך לשורה אחרת"),
      "no confusing assignment text"
    );
    console.log("✓ Issue-specific actions from registry");
  }

  // Hebrew / no jargon in presentations
  {
    const all = Object.values(ISSUE_PRESENTATIONS);
    for (const p of all) {
      const blob = `${p.title} ${p.explanation}`.toLowerCase();
      assert(!blob.includes("score"), "no score");
      assert(!blob.includes("confidence"), "no confidence");
      assert(!blob.includes("עמימות"), "no ambiguity");
      assert(!blob.includes("אלגוריתם"), "no algorithm");
      assert(!p.title.includes("חסום"), "no blocked title");
    }
    assert(
      toCriticalIssueCode("DXF_ASSIGNED_TO_BETTER_ROW") ===
        "DXF_ASSIGNMENT_CONFLICT",
      "alias"
    );
    console.log("✓ Assignment conflict wording + no jargon");
  }

  // Defer does not resolve; restore works; prune removes solved
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", quantity: null }),
          match: {
            status: "MATCHED",
            method: "EXACT_ID",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "MISSING_DATA",
        }),
      ],
      [part]
    );
    const code = pickPrimaryIssueCode(rows[0]!, new Set())!;
    assertEq(code, "MISSING_QUANTITY", "primary qty");
    const key = makeDeferredKey("r1", code);
    const deferred = new Set([key]);
    assertEq(
      pickPrimaryIssueCode(rows[0]!, deferred),
      null,
      "deferred hides primary when only issue"
    );
    assert(rows[0]!.issueCodes.includes("MISSING_QUANTITY"), "still unresolved");

    const fixed = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", quantity: null }),
          match: {
            status: "MATCHED",
            method: "EXACT_ID",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
          edits: { quantity: 2 },
        }),
      ],
      [part]
    );
    const pruned = pruneDeferredKeys(fixed, deferred);
    assertEq(pruned.size, 0, "pruned after solve");
    console.log("✓ Defer / restore / prune behavior");
  }

  // Multiple issues → one primary, not duplicated
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            quantity: null,
            material: null,
          }),
          match: {
            status: "UNMATCHED",
            method: null,
            matchedDxfId: null,
            candidates: [],
            message: null,
          },
          status: "NO_DXF",
        }),
      ],
      [part]
    );
    const ordered = orderedCriticalCodes(rows[0]!);
    assert(ordered.includes("MISSING_QUANTITY"), "has qty");
    assert(ordered.includes("MISSING_MATERIAL"), "has mat");
    assert(ordered.includes("NO_DXF_FOUND"), "has no dxf");
    assertEq(
      pickPrimaryIssueCode(rows[0]!, new Set()),
      "MISSING_QUANTITY",
      "qty first"
    );
    const afterQty = new Set([makeDeferredKey("r1", "MISSING_QUANTITY")]);
    assertEq(
      pickPrimaryIssueCode(rows[0]!, afterQty),
      "MISSING_MATERIAL",
      "next issue"
    );
    console.log("✓ Multiple issues: one primary, priority order");
  }

  // Solving one issue recalculates remaining
  {
    const base = resultRow({
      resultRowId: "r1",
      extracted: extracted({
        rowId: "e1",
        quantity: null,
        material: null,
        partId: "P1",
      }),
      match: {
        status: "MATCHED",
        method: "EXACT_ID",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      },
      status: "MISSING_DATA",
    });
    let rows = derive([base], [part]);
    assertEq(
      pickPrimaryIssueCode(rows[0]!, new Set()),
      "MISSING_QUANTITY",
      "before"
    );
    rows = derive([{ ...base, edits: { quantity: 3 } }], [part]);
    assertEq(
      pickPrimaryIssueCode(rows[0]!, new Set()),
      "MISSING_MATERIAL",
      "after qty"
    );
    console.log("✓ Solving one issue recalculates remaining");
  }

  // UI wiring
  {
    const root = path.resolve(__dirname, "..");
    const card = fs.readFileSync(
      path.join(root, "readiness/ReadinessIssueCard.tsx"),
      "utf8"
    );
    assert(card.includes("טפל אחר כך"), "defer on every card");
    assert(card.includes("presentationForCode"), "registry driven");
    assert(!card.includes("totalScore"), "no scores");
    assert(!card.includes("confidence"), "no confidence");

    const list = fs.readFileSync(
      path.join(root, "readiness/ReadinessIssueList.tsx"),
      "utf8"
    );
    assert(list.includes("לטיפול עכשיו"), "active section");
    assert(list.includes("טופל אחר כך"), "deferred section");
    assert(list.includes("הצג בעיות שנדחו"), "expand deferred");
    assert(list.includes("העלה קובצי DXF נוספים"), "top upload");
    assert(list.includes("המשך לטבלה"), "continue always");

    const cont = fs.readFileSync(
      path.join(root, "readiness/ContinueWithIssuesDialog.tsx"),
      "utf8"
    );
    assert(cont.includes("להמשיך לטבלה?"), "confirm title");
    assert(!cont.includes("כחסומות"), "no blocked wording");

    const wf = fs.readFileSync(
      path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
      "utf8"
    );
    assert(wf.includes("deferredIssueKeys"), "defer state");
    assert(wf.includes("appendDxfFilesAndRematch"), "local upload");
    assert(!wf.includes("/api/simple-intake/analyze"), "no AI rerun");

    const reg = fs.readFileSync(
      path.join(root, "readiness/issuePresentation.ts"),
      "utf8"
    );
    assert(reg.includes("ISSUE_PRESENTATIONS"), "registry");
    assert(reg.includes("שמור כמות"), "qty label");
    assert(reg.includes("השווה ובחר"), "compare label");

    assertEq(FIXED_TABLE_COLUMN_HEADERS.length, 12, "cols");
    const route = fs.readFileSync(
      path.join(root, "../../app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount: 1"), "one call");

    const p = presentationForCode("NO_DXF_FOUND")!;
    assertEq(p.primaryLabel, "בחר DXF", "no-dxf primary label");

    console.log("✓ UI wiring + continue + single provider call");
  }

  console.log(
    "\n=== All Generic Issue Action Cards and Defer Workflow v1 tests passed ==="
  );
}

run();
