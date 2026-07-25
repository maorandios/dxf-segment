/**
 * OMEGA — Exact-ID Priority and Smart Unassigned DXF Suggestions v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-exact-id-smart-suggestions-v1.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDxfDuplicates } from "../classifyDxfDuplicates";
import {
  matchWithFilenamePriority,
  resolveMatchLevel,
} from "../matchWithFilenamePriority";
import {
  applyManualDxfSelection,
  listRankedGeometryCandidatesForRow,
} from "../matchSimpleRows";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import {
  buildReservedDxfIds,
  getAvailableDxfCandidates,
  hasCopyLikeFilenameSuffix,
  pickCanonicalDuplicateMember,
  rejectedPairKey,
} from "../smartDxfAssignment";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  const partId = partial.partId ?? partial.filename.replace(/\.dxf$/i, "");
  const contentHash =
    "contentHash" in partial
      ? (partial.contentHash ?? null)
      : `hash:${partial.id}`;
  return {
    id: partial.id,
    filename: partial.filename,
    partId,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    areaMm2: (partial.widthMm ?? 100) * (partial.lengthMm ?? 200),
    geometryStatus: "VALID",
    error: null,
    fingerprint: contentHash ?? `fp:${partial.id}`,
    contentHash,
    normalizedFilenameKey: partial.filename.toLowerCase(),
  };
}

function extracted(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    rowId: partial.rowId,
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
    partId: "partId" in partial ? (partial.partId ?? null) : null,
    profile: null,
    description: null,
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    sourceAreaM2: null,
    sourceWeightKg: null,
    note: null,
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : null,
    confidence: 1,
    warnings: [],
  };
}

console.log("=== Exact-ID Priority and Smart Unassigned DXF Suggestions v1 ===\n");

{
  assert(hasCopyLikeFilenameSuffix("p1122 - Copy.dxf"), "copy space");
  assert(hasCopyLikeFilenameSuffix("p1122-copy.dxf"), "copy hyphen");
  assert(hasCopyLikeFilenameSuffix("p1122 (1).dxf"), "numbered");
  assert(!hasCopyLikeFilenameSuffix("p1122.dxf"), "exact not copy");
  assert(!hasCopyLikeFilenameSuffix("Company.dxf"), "company not copy");
  console.log("✓ Copy-like suffix detection (normalizer unchanged)");
}

{
  // p1122 regression — Copy uploaded first, same content
  const parts = [
    dxf({
      id: "copy",
      filename: "p1122 - Copy.dxf",
      partId: "p1122 - Copy",
      contentHash: "group-1",
      widthMm: 327,
      lengthMm: 100,
    }),
    dxf({
      id: "exact",
      filename: "p1122.dxf",
      partId: "p1122",
      contentHash: "group-1",
      widthMm: 327,
      lengthMm: 100,
    }),
  ];
  const rows = [
    extracted({
      rowId: "r1",
      partId: "p1122",
      widthMm: 327,
      lengthMm: 100,
      dxfFileName: null,
    }),
  ];

  const classified = classifyDxfDuplicates(parts, { sourceRows: rows });
  assertEq(
    classified.canonicalFileIdsByContentKey.get("group-1"),
    "exact",
    "canonical is p1122.dxf"
  );
  assert(classified.secondaryDuplicateFileIds.has("copy"), "copy is secondary");
  assert(
    !classified.secondaryDuplicateFileIds.has("exact"),
    "exact not secondary"
  );

  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  const row = matched.resultRows[0]!;
  assertEq(row.match.method, "EXACT_ID", "exact part id");
  assertEq(row.match.matchedDxfId, "exact", "matched p1122.dxf");
  assertEq(resolveMatchLevel(row.match), "CERTAIN", "certain");

  const finalRows = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "w.xlsx",
    snapshot: null,
  });
  assertEq(finalRows[0]!.status, "READY", "READY no approval");
  assertEq(
    finalRows[0]!.part.matchedDxfFilename,
    "p1122.dxf",
    "filename"
  );
  assert(
    !finalRows[0]!.issueCodes.includes("HEURISTIC_MATCH_UNCONFIRMED"),
    "no heuristic confirm"
  );

  const available = getAvailableDxfCandidates({
    dxfParts: parts,
    reservedDxfIds: buildReservedDxfIds({ resultRows: matched.resultRows }),
    nonCanonicalDuplicateDxfIds: classified.secondaryDuplicateFileIds,
    rejectedCandidatePairs: new Set(),
    materialRowId: "other",
  });
  assert(
    !available.some((d) => d.id === "copy"),
    "copy not available candidate"
  );
  assert(
    !available.some((d) => d.id === "exact"),
    "reserved exact not available"
  );
  assertEq(
    matched.smartSuggestionDiagnostics.exactAssignmentsOverwrittenByGeometry,
    0,
    "no overwrite"
  );
  assertEq(
    matched.smartSuggestionDiagnostics.duplicateInstancesUsedAsCandidates,
    0,
    "no dup candidates"
  );
  console.log("✓ p1122 → p1122.dxf CERTAIN; Copy is duplicate metadata");
}

{
  const canonical = pickCanonicalDuplicateMember(
    [
      { id: "a", filename: "p1122 - Copy.dxf", partId: "p1122 - Copy" },
      { id: "b", filename: "p1122.dxf", partId: "p1122" },
    ],
    new Set(["part:P1122"])
  );
  assertEq(canonical.id, "b", "prefer exact source identifier");
  console.log("✓ Canonical prefers exact identifier filename");
}

{
  // Geometry must not overwrite exact filename assignment
  const parts = [
    dxf({ id: "named", filename: "Special.dxf", partId: "Special", widthMm: 50, lengthMm: 50 }),
    dxf({ id: "geom", filename: "Other.dxf", partId: "Other", widthMm: 100, lengthMm: 200 }),
  ];
  const rows = [
    extracted({
      rowId: "r1",
      partId: null,
      dxfFileName: "Special.dxf",
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.method, "EXPLICIT_FILENAME", "filename first");
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "named", "named file");
  console.log("✓ Exact filename before geometry");
}

{
  // No-ID unique suggestion
  const parts = [
    dxf({ id: "best", filename: "A.dxf", widthMm: 255, lengthMm: 100 }),
    dxf({ id: "far", filename: "B.dxf", widthMm: 400, lengthMm: 400 }),
  ];
  const rows = [
    extracted({
      rowId: "noid",
      partId: null,
      dxfFileName: null,
      widthMm: 255,
      lengthMm: 100,
    }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  const row = matched.resultRows[0]!;
  assertEq(row.match.method, "GEOMETRY", "geometry suggestion");
  assertEq(row.match.matchedDxfId, "best", "best candidate");
  assertEq(resolveMatchLevel(row.match), "SUGGESTED", "suggested");
  const finals = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "w.xlsx",
    snapshot: null,
  });
  assertEq(finals[0]!.status, "NEEDS_REVIEW", "needs confirm");
  console.log("✓ No-ID unique candidate → SUGGESTED / NEEDS_REVIEW");
}

{
  // Reserved exact excludes geometry for other no-ID rows
  const parts = [
    dxf({ id: "p1", filename: "P1.dxf", partId: "P1", widthMm: 100, lengthMm: 200 }),
    dxf({ id: "alt", filename: "Alt.dxf", partId: "Alt", widthMm: 100, lengthMm: 200 }),
  ];
  const rows = [
    extracted({ rowId: "id", partId: "P1", widthMm: 100, lengthMm: 200 }),
    extracted({
      rowId: "noid",
      partId: null,
      dxfFileName: null,
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.method, "EXACT_ID", "exact reserved");
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "p1", "p1 taken");
  assertEq(matched.resultRows[1]!.match.matchedDxfId, "alt", "noid gets alt");
  assert(matched.resultRows[1]!.match.matchedDxfId !== "p1", "not reserved");
  console.log("✓ Reserved exact DXF excluded from no-ID pool");
}

{
  // Ambiguous top-two only
  const parts = [
    dxf({ id: "a", filename: "A.dxf", widthMm: 100, lengthMm: 200 }),
    dxf({ id: "b", filename: "B.dxf", widthMm: 100.1, lengthMm: 200.1 }),
    dxf({ id: "c", filename: "C.dxf", widthMm: 100.2, lengthMm: 200.2 }),
  ];
  const rows = [
    extracted({
      rowId: "noid",
      partId: null,
      dxfFileName: null,
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  const row = matched.resultRows[0]!;
  if (row.match.status === "AMBIGUOUS") {
    assert(row.match.candidates.length <= 2, "top two only");
  }
  console.log("✓ Ambiguous exposes at most top two candidates");
}

{
  // Reject suggestion → next candidate; confirm reserves
  const parts = [
    dxf({ id: "a", filename: "A.dxf", widthMm: 255, lengthMm: 100 }),
    dxf({ id: "b", filename: "B.dxf", widthMm: 256, lengthMm: 100 }),
  ];
  const rows = [
    extracted({
      rowId: "noid",
      partId: null,
      dxfFileName: null,
      widthMm: 255,
      lengthMm: 100,
    }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  const firstId = matched.resultRows[0]!.match.matchedDxfId!;
  const rejected = new Set([rejectedPairKey("noid", firstId)]);
  const available = getAvailableDxfCandidates({
    dxfParts: parts,
    reservedDxfIds: new Set(),
    nonCanonicalDuplicateDxfIds: new Set(),
    rejectedCandidatePairs: rejected,
    materialRowId: "noid",
  });
  const ranked = listRankedGeometryCandidatesForRow({
    row: rows[0]!,
    dxfParts: available,
  });
  assert(ranked.length >= 1, "next exists");
  assert(ranked[0]!.dxfId !== firstId, "different from rejected");

  const afterSuggest = applyManualDxfSelection({
    resultRows: matched.resultRows,
    resultRowId: "res_noid",
    dxfId: ranked[0]!.dxfId,
    dxfParts: parts,
    asSuggestion: true,
    candidates: ranked,
  });
  assert(afterSuggest.ok, "ok");
  if (afterSuggest.ok) {
    assertEq(
      afterSuggest.resultRows[0]!.match.method,
      "GEOMETRY",
      "still suggestion"
    );
  }

  const confirmed = applyManualDxfSelection({
    resultRows: afterSuggest.ok ? afterSuggest.resultRows : matched.resultRows,
    resultRowId: "res_noid",
    dxfId: ranked[0]!.dxfId,
    dxfParts: parts,
    asSuggestion: false,
  });
  assert(confirmed.ok, "confirm ok");
  if (confirmed.ok) {
    assertEq(confirmed.resultRows[0]!.match.method, "MANUAL", "manual confirm");
    const reserved = buildReservedDxfIds({
      resultRows: confirmed.resultRows,
      confirmedManualMatchIds: new Set(["res_noid"]),
    });
    assert(reserved.has(ranked[0]!.dxfId), "reserved after confirm");
  }
  console.log("✓ Reject cycles to next; confirm reserves as MANUAL");
}

{
  // Partial identifier fixture: 10 with ID + 2 without
  const parts: SimpleDxfPart[] = [];
  const rows: SimpleExtractedRow[] = [];
  for (let i = 0; i < 10; i++) {
    const id = `P${i}`;
    parts.push(
      dxf({
        id: `d${i}`,
        filename: `${id}.dxf`,
        partId: id,
        widthMm: 100 + i,
        lengthMm: 200,
      })
    );
    rows.push(
      extracted({
        rowId: `r${i}`,
        partId: id,
        widthMm: 100 + i,
        lengthMm: 200,
      })
    );
  }
  parts.push(
    dxf({ id: "g0", filename: "G0.dxf", widthMm: 50, lengthMm: 50 }),
    dxf({ id: "g1", filename: "G1.dxf", widthMm: 60, lengthMm: 60 })
  );
  rows.push(
    extracted({
      rowId: "n0",
      partId: null,
      widthMm: 50,
      lengthMm: 50,
      dxfFileName: null,
    }),
    extracted({
      rowId: "n1",
      partId: null,
      widthMm: 60,
      lengthMm: 60,
      dxfFileName: null,
    })
  );
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  for (let i = 0; i < 10; i++) {
    assertEq(
      matched.resultRows[i]!.match.method,
      "EXACT_ID",
      `exact ${i}`
    );
  }
  assertEq(
    matched.smartSuggestionDiagnostics.exactPartIdAssignmentCount,
    10,
    "10 exact"
  );
  assert(
    matched.resultRows[10]!.match.matchedDxfId !==
      matched.resultRows[0]!.match.matchedDxfId,
    "noid not stealing exact"
  );
  console.log("✓ Partial-ID: exact reserved before no-ID suggestions");
}

{
  const root = path.resolve(__dirname, "..");
  const drawer = fs.readFileSync(
    path.join(root, "results/SimpleItemDetailsDrawer.tsx"),
    "utf8"
  );
  assert(drawer.includes("הצע קובץ אחר"), "suggest another");
  assert(drawer.includes("השאר ללא שיוך"), "leave unassigned");
  assert(drawer.includes("חיפוש ידני"), "manual search");
  assert(drawer.includes("שיוך DXF"), "dxf section");
  const picker = fs.readFileSync(
    path.join(root, "results/DxfCandidatePicker.tsx"),
    "utf8"
  );
  assert(picker.includes('mode === "candidates"'), "picker modes");
  console.log("✓ Side panel UX strings present");
}

{
  const s = summarizeFinalRows(
    deriveFinalRows({
      resultRows: matchWithFilenamePriority({
        extractedRows: [
          extracted({
            rowId: "r",
            partId: "p1122",
            widthMm: 327,
            lengthMm: 100,
          }),
        ],
        dxfParts: [
          dxf({
            id: "copy",
            filename: "p1122 - Copy.dxf",
            partId: "p1122 - Copy",
            contentHash: "g",
            widthMm: 327,
            lengthMm: 100,
          }),
          dxf({
            id: "exact",
            filename: "p1122.dxf",
            partId: "p1122",
            contentHash: "g",
            widthMm: 327,
            lengthMm: 100,
          }),
        ],
      }).resultRows,
      dxfParts: [
        dxf({
          id: "copy",
          filename: "p1122 - Copy.dxf",
          partId: "p1122 - Copy",
          contentHash: "g",
          widthMm: 327,
          lengthMm: 100,
        }),
        dxf({
          id: "exact",
          filename: "p1122.dxf",
          partId: "p1122",
          contentHash: "g",
          widthMm: 327,
          lengthMm: 100,
        }),
      ],
      workbookFilename: "w.xlsx",
      snapshot: null,
    })
  );
  assertEq(s.ready, 1, "ready");
  assertEq(s.needsAttention, 0, "no attention");
  console.log("✓ Status totals after exact match");
}

console.log(
  "\n=== Exact-ID Priority and Smart Unassigned DXF Suggestions v1: PASS ==="
);
