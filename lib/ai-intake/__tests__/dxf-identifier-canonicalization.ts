/**
 * DXF / workbook part-identifier extraction and canonicalization.
 * Run: npx tsx lib/ai-intake/__tests__/dxf-identifier-canonicalization.ts
 */
import {
  applyCrossFileIdentityValidation,
  summarizeDxfRegistry,
} from "../buildDxfRegistry";
import {
  extractFilenameCandidate,
  resolveDxfIdentity,
} from "../extractDxfIdentity";
import {
  canonicalizePartIdentifier,
  extractRawDxfIdentifier,
  normalizePartId,
  partIdentityKey,
} from "../normalizePartId";
import { DXF_ISSUE, type DxfPartRegistryItem } from "../types";

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

function registryFromFilenames(names: string[]): DxfPartRegistryItem[] {
  return names.map((filename, i) => {
    const id = resolveDxfIdentity(filename, []);
    return {
      id: `dxf-${i}-${filename}`,
      canonicalPartId: id.canonicalPartId,
      revision: id.revision,
      rawPartId: id.rawPartId,
      normalizedRawPartId: id.normalizedRawPartId,
      identitySource: id.identitySource,
      identityOk: id.identityOk,
      identityIssues: [...id.identityIssues],
      identity: id.identity,
      layerMetadata: id.layerMetadata,
      revisionIssue: false,
      duplicateIssue: false,
      filename,
      widthMm: 100,
      heightMm: 100,
      plateAreaMm2: 10000,
      netContourAreaMm2: 9500,
      perimeterMm: 400,
      geometryStatus: "VALID",
      warnings: [],
      processedGeometry: null,
    };
  });
}

/** 99 unique mixed identifiers matching the production workbook pattern. */
function fixture99Ids(): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= 80; i++) ids.push(`5P${i}`);
  for (let i = 1; i <= 19; i++) ids.push(`5SP${i}`);
  assertEq(ids.length, 99, "fixture size");
  assertEq(new Set(ids).size, 99, "unique");
  return ids;
}

function main() {
  console.log("\n=== Test 1 — leading digit identifier ===");
  {
    const cand = extractFilenameCandidate("5P1.dxf");
    assert(cand, "candidate");
    assertEq(cand!.rawPartId, "5P1", "raw");
    assertEq(cand!.canonicalPartId, "5P1", "canonical");
    const resolved = resolveDxfIdentity("5P1.dxf", []);
    assert(resolved.identityOk, "valid");
    assertEq(resolved.canonicalPartId, "5P1", "resolved canonical");
  }
  console.log("PASS");

  console.log("\n=== Test 2 — multiple letters after leading digit ===");
  {
    const cand = extractFilenameCandidate("5SP10.dxf");
    assert(cand, "candidate");
    assertEq(cand!.rawPartId, "5SP10", "raw");
    assertEq(cand!.canonicalPartId, "5SP10", "canonical");
  }
  console.log("PASS");

  console.log("\n=== Test 3 — existing identifier regression ===");
  {
    const cand = extractFilenameCandidate("P1091.dxf");
    assert(cand, "candidate");
    assertEq(cand!.canonicalPartId, "P1091", "P1091");
    assert(resolveDxfIdentity("P1091.dxf", []).identityOk, "ok");
  }
  console.log("PASS");

  console.log("\n=== Test 4 — case normalization ===");
  {
    const cand = extractFilenameCandidate("5sp10.DXF");
    assert(cand, "candidate");
    assertEq(cand!.canonicalPartId, "5SP10", "canonical upper");
  }
  console.log("PASS");

  console.log("\n=== Test 5 — leading zeroes ===");
  {
    const cand = extractFilenameCandidate("00125.dxf");
    assert(cand, "candidate");
    assertEq(cand!.canonicalPartId, "00125", "keep zeros");
    assertEq(canonicalizePartIdentifier("00125"), "00125", "direct");
  }
  console.log("PASS");

  console.log("\n=== Test 6 — supported separators ===");
  {
    assertEq(
      extractFilenameCandidate("PL-104.dxf")?.canonicalPartId,
      "PL104",
      "hyphen collapse"
    );
    assertEq(
      extractFilenameCandidate("PL_104.dxf")?.canonicalPartId,
      "PL104",
      "underscore collapse"
    );
    assertEq(
      extractFilenameCandidate("A12-B.dxf")?.canonicalPartId,
      "A12B",
      "A12-B"
    );
    assert(resolveDxfIdentity("PL-104.dxf", []).identityOk, "pl ok");
    assert(resolveDxfIdentity("A12-B.dxf", []).identityOk, "a12b ok");
  }
  console.log("PASS");

  console.log("\n=== Test 7 — whitespace and Unicode ===");
  {
    const cand = normalizePartId(" PL\u2013104.dxf ");
    assertEq(cand?.canonicalPartId, "PL104", "unicode dash + spaces");
    assertEq(extractRawDxfIdentifier("5P1\u200B.dxf"), "5P1", "zw stem");
    assertEq(canonicalizePartIdentifier("5p\u200B1"), "5P1", "zw canon");
    assertEq(
      extractRawDxfIdentifier(" 5P64.DXF "),
      "5P64",
      "trim + ext"
    );
    assertEq(
      extractRawDxfIdentifier("/folder/5SP10.dxf"),
      "5SP10",
      "path"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 8 — invalid punctuation-only filename ===");
  {
    assertEq(extractFilenameCandidate("---.dxf"), null, "--- invalid");
    assertEq(extractFilenameCandidate("___.dxf"), null, "___ invalid");
    assertEq(normalizePartId("."), null, "dot invalid");
    assert(!resolveDxfIdentity("---.dxf", []).identityOk, "not ok");
    assert(
      resolveDxfIdentity("---.dxf", []).identityIssues.includes(
        DXF_ISSUE.NO_PART_ID
      ),
      "NO_PART_ID"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 9 — duplicate canonical identity ===");
  {
    const flagged = applyCrossFileIdentityValidation(
      registryFromFilenames(["5p1.dxf", "5P1.dxf"])
    );
    assertEq(flagged[0]!.canonicalPartId, "5P1", "same canonical");
    assertEq(flagged[1]!.canonicalPartId, "5P1", "same canonical 2");
    assert(
      flagged.every((i) => i.duplicateIssue && !i.identityOk),
      "collision flagged"
    );
    assert(
      flagged.every((i) => i.identityIssues.includes(DXF_ISSUE.DUPLICATE_ID)),
      "DUPLICATE_ID"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 10 — workbook matching ===");
  {
    const wb = normalizePartId("5P64");
    const dxf = extractFilenameCandidate("5P64.dxf");
    assertEq(wb?.canonicalPartId, dxf?.canonicalPartId, "match 5P64");
    assertEq(wb?.canonicalPartId, "5P64", "canonical");
  }
  console.log("PASS");

  console.log("\n=== Test 11 — 5SP matching ===");
  {
    const wb = normalizePartId("5SP10");
    const dxf = extractFilenameCandidate("5SP10.dxf");
    assertEq(wb?.canonicalPartId, "5SP10", "wb");
    assertEq(dxf?.canonicalPartId, "5SP10", "dxf");
    assertEq(wb?.canonicalPartId, dxf?.canonicalPartId, "match");
  }
  console.log("PASS");

  console.log("\n=== Test 12 — full 99-identifier fixture ===");
  {
    const ids = fixture99Ids();
    const canons = ids.map((id) => canonicalizePartIdentifier(id));
    assert(
      canons.every((c) => c != null),
      "all canonicalize"
    );
    assertEq(new Set(canons).size, 99, "no unexpected collapse");
    for (let i = 0; i < ids.length; i++) {
      assertEq(canons[i], ids[i]!.toUpperCase(), `preserve ${ids[i]}`);
    }
    assert(canons.includes("5P1"), "5P1 present");
    assert(canons.includes("5SP10"), "5SP10 present");
    assert(canons.includes("5P1") && canons.includes("5SP10"), "distinct pair");
  }
  console.log("PASS");

  console.log("\n=== Test 13 — DXF registry preflight ===");
  {
    const ids = fixture99Ids();
    const items = applyCrossFileIdentityValidation(
      registryFromFilenames(ids.map((id) => `${id}.dxf`))
    );
    const summary = summarizeDxfRegistry(items);
    assertEq(summary.uploadedDxfCount, 99, "99 files");
    assertEq(summary.validIdentityCount, 99, "99 valid ids");
    assertEq(
      items.filter((i) =>
        i.identityIssues.includes(DXF_ISSUE.NO_PART_ID)
      ).length,
      0,
      "0 NO_PART_ID"
    );
    assert(summary.validIdentityCount > 0, "preflight passes");
  }
  console.log("PASS");

  console.log("\n=== Test 14 — existing fixture regressions ===");
  {
    for (const id of ["P1091", "P1098", "PL-104"]) {
      const c = normalizePartId(id);
      assert(c, `${id} valid`);
      assert(c!.canonicalPartId.length > 0, `${id} canonical`);
    }
    assertEq(normalizePartId("PL-104")?.canonicalPartId, "PL104", "PL-104");
    assertEq(
      extractFilenameCandidate("P1091.dxf")?.canonicalPartId,
      "P1091",
      "P1091 dxf"
    );
    assertEq(
      extractFilenameCandidate("P1098.dxf")?.canonicalPartId,
      "P1098",
      "P1098 dxf"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 15 — complete stem, not substring ===");
  {
    assertEq(
      extractFilenameCandidate("5SP10.dxf")?.canonicalPartId,
      "5SP10",
      "not SP10"
    );
    assertEq(
      extractFilenameCandidate("5P64.dxf")?.canonicalPartId,
      "5P64",
      "not P64"
    );
    assertEq(partIdentityKey("5P1", null), "5P1::", "key");
  }
  console.log("PASS");

  console.log("\nAll DXF identifier canonicalization tests passed.");
}

main();
