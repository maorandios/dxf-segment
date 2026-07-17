/**
 * Filename-authoritative DXF identity contract.
 * Run: npx tsx lib/ai-intake/__tests__/dxf-filename-authoritative-identity.ts
 */
import {
  applyCrossFileIdentityValidation,
  buildRegistryItemFromParsed,
  summarizeDxfRegistry,
  validateDxfRegistryEntry,
} from "../buildDxfRegistry";
import {
  buildDxfIdentityDiagnostics,
  resolveDxfIdentity,
  resolveDxfIdentityWithMetadata,
  validateDxfIdentityPair,
} from "../extractDxfIdentity";
import { matchPartToDxf } from "../matching";
import { toDxfMatchRegistryEntries } from "../matching/registryAdapter";
import { buildReviewSession } from "../review/buildReviewSession";
import { emptyDocumentGeometry } from "../schemas";
import { DXF_ISSUE, type DxfPartRegistryItem } from "../types";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
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

function itemFrom(
  filename: string,
  layers: string[],
  opts?: { geometryStatus?: DxfPartRegistryItem["geometryStatus"] }
): DxfPartRegistryItem {
  const item = buildRegistryItemFromParsed({
    id: `id:${filename}`,
    filename,
    layers,
    processedGeometry:
      opts?.geometryStatus === "INVALID"
        ? null
        : ({
            status: "valid",
            isValid: true,
            statusMessage: null,
            boundingBox: {
              width: 100,
              height: 50,
              minX: 0,
              minY: 0,
              maxX: 100,
              maxY: 50,
            },
            area: 4800,
            perimeter: 300,
            outer: [[0, 0]],
            holes: [],
          } as unknown as DxfPartRegistryItem["processedGeometry"]),
    parseWarnings: [],
  });
  if (opts?.geometryStatus === "INVALID") {
    return { ...item, geometryStatus: "INVALID", widthMm: null, heightMm: null };
  }
  return item;
}

function docRow(part: string): ExtractedDocumentRow {
  return {
    documentId: "doc:1",
    matchedDxfPartId: part,
    rawPartReference: part,
    quantity: 2,
    thicknessMm: 10,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: emptyDocumentGeometry(),
    source: {
      type: "XLSX",
      fileName: "parts.xlsx",
      sheetName: "S",
      rowNumber: 2,
      pageNumber: null,
      partReferenceCell: "B2",
      quantityCell: "A2",
      thicknessCell: "C2",
      materialCell: "D2",
      excerpt: part,
    },
    issues: [],
  };
}

function emptyFinal(partId: string): FinalIntakeMappingRow {
  return {
    status: "READY",
    partId,
    displayLabel: null,
    revision: null,
    dxfFileId: `dxf:${partId}`,
    dxfFilename: `${partId}.dxf`,
    widthMm: 100,
    heightMm: 50,
    plateAreaMm2: 5000,
    netContourAreaMm2: 4800,
    perimeterMm: 300,
    quantity: 2,
    thicknessMm: 10,
    material: "S235",
    description: null,
    action: "INCLUDE",
    fieldSources: { quantity: "XLSX", thickness: "XLSX", material: "XLSX" },
    fieldCandidates: { quantity: [], thickness: [], material: [] },
    fieldResolutions: {
      quantity: { value: 2, resolutionStatus: "SINGLE_SOURCE", candidates: [] },
      thickness: {
        value: 10,
        resolutionStatus: "SINGLE_SOURCE",
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
    occurrenceCount: 0,
    duplicateOccurrenceCount: 0,
    duplicateStatus: "NONE",
    ignoredOccurrences: [],
    duplicateIssues: [],
    geometryComparisons: [],
    geometryComparisonStatus: "NOT_AVAILABLE",
  };
}

function successFrom(
  docs: ExtractedDocumentRow[],
  finals: FinalIntakeMappingRow[]
): AiIntakeAnalyzeSuccess {
  return {
    ok: true,
    extraction: {
      documentRows: docs,
      emailFacts: [],
      unresolvedItems: [],
      warnings: [],
    },
    acceptedFacts: [],
    aggregated: {
      documents: [],
      emailFacts: [],
      expandedFacts: [],
      emailUsage: null,
      emailDurationMs: null,
      openaiCallCount: 1,
      partial: false,
    },
    auditRows: [],
    auditSummary: {
      customerPartsSeen: docs.length,
      matchedCount: docs.length,
      requestWithoutDxfCount: 0,
      dxfNotReferencedCount: 0,
      requiresReviewCount: 0,
      failedSourceCount: 0,
    },
    finalRows: finals,
    warnings: [],
    partial: false,
    debug: {
      model: "test",
      durationMs: 1,
      openaiCallCount: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      perSourceUsage: [],
    },
  };
}

function main() {
  console.log("\n=== Test 1 — valid filename, no layers ===");
  {
    const r = resolveDxfIdentityWithMetadata({
      fileName: "A1.dxf",
      layerNames: [],
    });
    assertEq(r.identity.source, "FILENAME", "source");
    assertEq(r.identity.status, "VALID", "status");
    assertEq(r.identity.canonicalPartId, "A1", "canonical");
  }
  console.log("PASS");

  console.log("\n=== Test 2 — agreeing layer ===");
  {
    const r = resolveDxfIdentityWithMetadata({
      fileName: "A1.dxf",
      layerNames: ["A1"],
    });
    assertEq(r.identity.status, "VALID", "valid");
    assertEq(r.layerMetadata.status, "AGREES_WITH_FILENAME", "agrees");
  }
  console.log("PASS");

  console.log("\n=== Test 3 — disagreeing layer ===");
  {
    const r = resolveDxfIdentityWithMetadata({
      fileName: "A1.dxf",
      layerNames: ["OLD-A7"],
    });
    assertEq(r.identity.status, "VALID", "valid");
    assertEq(r.identity.source, "FILENAME", "filename");
    assertEq(r.identity.canonicalPartId, "A1", "A1");
    assertEq(r.layerMetadata.status, "DIFFERS_FROM_FILENAME", "differs");
    assert(r.layerMetadata.warnings.length > 0, "warning");
    const flat = resolveDxfIdentity("A1.dxf", ["OLD-A7"]);
    assert(flat.identityOk, "identityOk true");
    assert(
      !flat.identityIssues.includes(DXF_ISSUE.IDENTITY_CONFLICT),
      "no blocking conflict"
    );
    const diag = buildDxfIdentityDiagnostics({
      fileName: "A1.dxf",
      identity: r.identity,
      layerMetadata: r.layerMetadata,
      geometryStatus: "VALID",
    });
    assert(diag.eligibleForExactMatching, "eligible");
    assertEq(diag.identityStatus, "VALID", "diag valid");
  }
  console.log("PASS");

  console.log("\n=== Test 4 — many identifier-like layers ===");
  {
    const r = resolveDxfIdentityWithMetadata({
      fileName: "A1.dxf",
      layerNames: ["OLD-A7", "B12", "CUT"],
    });
    assertEq(r.identity.status, "VALID", "valid");
    assertEq(r.identity.source, "FILENAME", "filename");
    assertEq(r.identity.canonicalPartId, "A1", "A1");
    assertEq(r.identity.status, "VALID", "still valid");
  }
  console.log("PASS");

  console.log("\n=== Test 5 — layer fallback ===");
  {
    const r = resolveDxfIdentityWithMetadata({
      fileName: "---.dxf",
      layerNames: ["A1"],
    });
    assertEq(r.identity.status, "VALID", "valid");
    assertEq(r.identity.source, "LAYER_FALLBACK", "fallback");
    assertEq(r.identity.canonicalPartId, "A1", "A1");
  }
  console.log("PASS");

  console.log("\n=== Test 6 — ambiguous layer fallback ===");
  {
    const r = resolveDxfIdentityWithMetadata({
      fileName: "---.dxf",
      layerNames: ["A1", "A2"],
    });
    assertEq(r.identity.status, "INVALID", "invalid");
    assertEq(r.identity.reason, "AMBIGUOUS_LAYER_FALLBACK", "reason");
  }
  console.log("PASS");

  console.log("\n=== Test 7 — filename collision ===");
  {
    const items = applyCrossFileIdentityValidation([
      itemFrom("a1.dxf", []),
      itemFrom("A1.DXF", []),
    ]);
    assert(
      items.every((i) => i.identity.status === "COLLISION"),
      "collision"
    );
    assert(
      items.every((i) => !i.identityOk),
      "identityOk false"
    );
    const match = matchPartToDxf({
      sourceRawId: "A1",
      registry: toDxfMatchRegistryEntries(items),
    });
    assertEq(match.status, "AMBIGUOUS", "ambiguous match");
    assertEq(match.candidates.length, 2, "two candidates");
  }
  console.log("PASS");

  console.log("\n=== Test 8 — layer disagreement is not collision ===");
  {
    const items = applyCrossFileIdentityValidation([
      itemFrom("A1.dxf", ["B1"]),
      itemFrom("A2.dxf", ["A1"]),
    ]);
    assertEq(items[0]!.identity.canonicalPartId, "A1", "A1");
    assertEq(items[1]!.identity.canonicalPartId, "A2", "A2");
    assert(
      items.every((i) => i.identity.status === "VALID"),
      "both valid"
    );
    assert(
      items.every((i) => !i.duplicateIssue),
      "no collision"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 9 — exact matching despite layer disagreement ===");
  {
    const registry = [itemFrom("A1.dxf", ["B1"])];
    const match = matchPartToDxf({
      sourceRawId: "A1",
      registry: toDxfMatchRegistryEntries(registry),
    });
    assertEq(match.status, "MATCHED", "matched");
    assertEq(match.reason, "EXACT_CANONICAL_MATCH", "reason");
    assert(match.status === "MATCHED" && match.candidates[0]!.identityOk, "ok");
    const session = buildReviewSession(
      successFrom([docRow("A1")], [emptyFinal("A1")]),
      { registry }
    );
    const row = session.rows[0]!;
    assertEq(row.dxfMatchStatus, "MATCHED", "review matched");
    assertEq(row.status, "READY", "ready");
    assert(row.dxfGeometry != null, "geometry");
  }
  console.log("PASS");

  console.log("\n=== Test 10 — identityOk compatibility ===");
  {
    const flat = resolveDxfIdentity("A1.dxf", ["B1"]);
    assert(flat.identityOk, "identityOk");
    assertEq(flat.identity.status, "VALID", "status");
    assertEq(flat.identityOk, flat.identity.status === "VALID", "derived");
  }
  console.log("PASS");

  console.log("\n=== Test 11 — preflight counters ===");
  {
    const items: DxfPartRegistryItem[] = [];
    for (let i = 1; i <= 10; i++) {
      const layers = i <= 4 ? [`OTHER-${i}`] : [];
      items.push(itemFrom(`P${i}.dxf`, layers));
    }
    items.push(itemFrom("---.dxf", ["FALL1"]));
    const summary = summarizeDxfRegistry(items);
    assertEq(summary.validIdentityCount, 11, "11 valid");
    assertEq(summary.identityConflictCount, 0, "0 errors");
    assert(
      (summary.layerMetadataWarningCount ?? 0) >= 4,
      "layer warnings"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 12 — UI primary status logic ===");
  {
    const item = itemFrom("PART-10.dxf", ["OLD-PART-7"]);
    assert(item.identityOk, "ok");
    assertEq(item.identity.status, "VALID", "valid");
    assert(
      item.layerMetadata.status === "DIFFERS_FROM_FILENAME",
      "differs"
    );
    // Primary UI uses identityOk / VALID → תקין (not identity problem)
    assert(item.identityOk && item.identity.status !== "INVALID", "green");
  }
  console.log("PASS");

  console.log("\n=== Test 13 — geometry invalid separate ===");
  {
    const item = itemFrom("A1.dxf", [], { geometryStatus: "INVALID" });
    assertEq(item.identity.status, "VALID", "identity valid");
    assertEq(item.geometryStatus, "INVALID", "geo invalid");
    assert(item.identityOk, "identityOk");
  }
  console.log("PASS");

  console.log("\n=== Test 14 — shared identifier formats ===");
  {
    for (const name of [
      "P1091.dxf",
      "5P68.dxf",
      "5SP10.dxf",
      "00125.dxf",
      "A12-B.dxf",
      "PL-104.dxf",
    ]) {
      const r = resolveDxfIdentityWithMetadata({
        fileName: name,
        layerNames: ["UNRELATED-99"],
      });
      assertEq(r.identity.source, "FILENAME", name);
      assertEq(r.identity.status, "VALID", `${name} valid`);
      assert(r.identity.canonicalPartId, `${name} id`);
    }
  }
  console.log("PASS");

  console.log("\n=== Test 15 — matching contract ===");
  {
    const one = matchPartToDxf({
      sourceRawId: "A1",
      registry: toDxfMatchRegistryEntries([itemFrom("A1.dxf", ["X1"])]),
    });
    assertEq(one.status, "MATCHED", "one");

    const amb = matchPartToDxf({
      sourceRawId: "A1",
      registry: toDxfMatchRegistryEntries(
        applyCrossFileIdentityValidation([
          itemFrom("a1.dxf", []),
          itemFrom("A1.DXF", []),
        ])
      ),
    });
    assertEq(amb.status, "AMBIGUOUS", "collision");

    const none = matchPartToDxf({
      sourceRawId: "A1",
      registry: toDxfMatchRegistryEntries([
        itemFrom("A12.dxf", []),
        itemFrom("A15.dxf", []),
      ]),
    });
    assertEq(none.status, "UNMATCHED", "unmatched");
    assert(none.suggestions.length > 0, "suggestions");
  }
  console.log("PASS");

  console.log("\n=== Test 17 — large-registry smoke ===");
  {
    const items: DxfPartRegistryItem[] = [];
    for (let i = 1; i <= 40; i++) {
      items.push(itemFrom(`A${i}.dxf`, i % 3 === 0 ? [`LEGACY-${i}`] : ["CUT", "0"]));
    }
    const flagged = applyCrossFileIdentityValidation(items);
    assert(
      flagged.every((i) => i.identity.status === "VALID"),
      "all valid filenames"
    );
    assert(
      flagged.filter((i) =>
        i.layerMetadata.status === "DIFFERS_FROM_FILENAME"
      ).length > 0,
      "some layer differs"
    );
    assertEq(
      summarizeDxfRegistry(flagged).identityConflictCount,
      0,
      "no identity errors"
    );
    const session = buildReviewSession(
      successFrom(
        [docRow("A1"), docRow("A10"), docRow("A3")],
        [emptyFinal("A1"), emptyFinal("A10"), emptyFinal("A3")]
      ),
      { registry: flagged }
    );
    for (const row of session.rows) {
      assertEq(row.dxfMatchStatus, "MATCHED", `${row.displayPartReference}`);
      const reg = flagged.find(
        (i) => i.canonicalPartId === row.matchedDxfPartId
      );
      assert(reg?.identityOk, "identityOk after analysis");
    }
  }
  console.log("PASS");

  console.log("\n=== Test 5P68-style disagreement ===");
  {
    const item = itemFrom("5P68.dxf", ["OLD-TEMPLATE", "CUT", "X99"]);
    const diag = buildDxfIdentityDiagnostics({
      fileName: item.filename,
      identity: item.identity,
      layerMetadata: item.layerMetadata,
      geometryStatus: item.geometryStatus,
    });
    assertEq(diag.identitySource, "FILENAME", "source");
    assertEq(diag.identityStatus, "VALID", "status");
    assertEq(diag.authoritativeCanonicalId, "5P68", "id");
    assert(
      diag.layerMetadataStatus === "DIFFERS_FROM_FILENAME" ||
        diag.layerMetadataStatus === "MULTIPLE_IDENTIFIER_LIKE_LAYERS",
      "layer meta"
    );
    assert(diag.eligibleForExactMatching, "eligible");
    validateDxfRegistryEntry(item);
    validateDxfIdentityPair({
      fileName: item.filename,
      identity: item.identity,
      layerMetadata: item.layerMetadata,
    });
  }
  console.log("PASS");

  console.log("\nAll filename-authoritative identity tests passed.");
}

main();
