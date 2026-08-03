/**
 * OMEGA — Portable Quotation Project Save and Restore v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-omega-project-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

import {
  assertSafeArchivePath,
  buildHydratedSession,
  buildOmegaProjectArchive,
  createOmegaProjectSnapshot,
  filesFromBinaryAssets,
  getBrowserProjectPersistenceDiagnostics,
  getGeometryByFilename,
  getOmegaProjectFileDiagnostics,
  getParseInvocationCountDuringLoad,
  hasUnsavedProjectChanges,
  loadOmegaProjectFile,
  migrateOmegaProject,
  OMEGA_PROJECT_FORMAT,
  OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION,
  OMEGA_PROJECT_NEVER_PERSISTS_TO_BROWSER_STORAGE,
  OMEGA_PROJECT_PATHS,
  OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  bumpProjectRevision,
  markProjectExported,
  resetBrowserProjectPersistenceDiagnosticsForTests,
  resetDiagnostics,
  resetLoadCounters,
  resetProjectDirtyState,
  setGeometryEntries,
  clearGeometryCache,
} from "../omegaProject";
import type { SimpleIntakeSession } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const omegaRoot = path.join(root, "omegaProject");

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function minimalSession(overrides: Partial<SimpleIntakeSession> = {}): SimpleIntakeSession {
  const workbook = new File(
    [new TextEncoder().encode("part,qty\nA1,2\n")],
    "list.xlsx",
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );
  const dxf = new File([`0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n`], "5P1.dxf", {
    type: "application/dxf",
  });

  const base: SimpleIntakeSession = {
    status: "READY",
    quoteDetails: {
      projectName: "פרויקט בדיקה",
      customerName: "לקוח בדיקה",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    quoteStage: "UNIFIED_REVIEW",
    enteredQuoteStages: ["DXF_INTAKE", "MATERIAL_INTAKE", "UNIFIED_REVIEW"],
    runId: "simple_test_run",
    workbookFile: workbook,
    dxfFiles: [dxf],
    workbookSnapshot: {
      workbookId: "wb1",
      filename: "list.xlsx",
      sheets: [],
    },
    materialListRows: [],
    materialListApproved: true,
    materialListShowUnresolvedOnly: false,
    extractedRows: [],
    dxfParts: [
      {
        id: "dxf_1",
        filename: "5P1.dxf",
        partId: "5P1",
        widthMm: 100,
        lengthMm: 200,
        areaMm2: 20000,
        geometryStatus: "VALID",
        error: null,
        fingerprint: "abc",
        contentHash: "abc",
        normalizedFilenameKey: "5p1.dxf",
      },
    ],
    resultRows: [],
    unmatchedDxfIds: [],
    dxfAvailability: [],
    coverageIssues: [],
    exactIdOccurrences: [],
    localSummary: null,
    matchingDiagnostics: null,
    hasCoverageWarnings: false,
    error: null,
    timing: {
      workbookSnapshotMs: null,
      dxfParseMs: null,
      aiCallMs: null,
      coverageCheckMs: null,
      matchingMs: null,
      candidateGenerationMs: null,
      automaticAssignmentMs: null,
      strongAssignmentMs: null,
      propagationMs: null,
      finalClassificationMs: null,
      availabilityDerivationMs: null,
      totalMs: null,
    },
    analyzingLabel: null,
    startedAt: null,
    completedAt: null,
    lastDebug: { apiKey: "SECRET_SHOULD_REDACT", note: "ok" },
    providerCallCount: 1,
    frozenMaterialRows: { row1: "2026-08-01T12:00:00.000Z" },
    quoteItemCommercialOptions: {
      row1: { finish: "BLACK", isCheckeredPlate: false },
    },
    finalQuoteListMembership: {
      includedMaterialRowIds: ["row1"],
      createdAt: "2026-08-01T12:00:00.000Z",
    },
    weightPricingDraft: {
      quotationId: "simple_test_run",
      updatedAt: "2026-08-01T12:30:00.000Z",
      defaults: {
        blackPricePerKg: 10,
        galvanizedPricePerKg: 12,
        checkeredPlateAddonPerKg: 1,
      },
      groupPricingByKey: {
        g1: { manualFinalPricePerKg: 11.5 },
      },
    },
    weightPricingNestingCache: {
      quotationId: "simple_test_run",
      scopeKey: "scope",
      estimatesBySignature: {
        sig1: {
          groupKey: "g1",
          status: "READY",
          utilizationPercent: 72.5,
          wastePercent: 27.5,
          wasteWeightKg: 1.2,
          totalSelectedStockWeightKg: 10,
          selectedSheets: [{ widthMm: 1500, lengthMm: 3000, quantity: 1 }],
          unplacedPartCount: 0,
          errorMessage: null,
          failureDetails: [],
          inputSignature: "sig1",
        },
      },
    },
    weightPricingSummaryPayload: null,
    finalQuotationDraft: {
      quotationId: "simple_test_run",
      metadata: {
        customerName: "לקוח בדיקה",
        projectName: "פרויקט בדיקה",
        quotationDate: "2026-08-01",
        quotationValidityDate: "2026-08-08",
        quotationNumber: "P2026001",
      },
      vatRatePercent: 18,
      notes: "הערת בדיקה",
      updatedAt: "2026-08-01T13:00:00.000Z",
    },
    forcedReviewWorkspaceView: "FINAL_TABLE",
    materialRowUserResolutions: {
      row1: {
        materialRowId: "row1",
        analysisRunId: "simple_test_run",
        overrides: {
          material: {
            value: "S355",
            source: "MANUAL_ENTRY",
            updatedAt: "2026-08-01T11:00:00.000Z",
          },
        },
        dimensionDecision: "USE_DXF_DIMENSIONS",
        resolvedDxfId: "dxf_1",
        resolvedAt: "2026-08-01T11:00:00.000Z",
        updatedAt: "2026-08-01T11:00:00.000Z",
      },
    },
    confirmedManualMatchIds: [],
    hydrationStatus: "READY",
  };

  return { ...base, ...overrides };
}

console.log("OMEGA — Portable Quotation Project Save and Restore v1");

// ── Source wiring ──────────────────────────────────────────────────────────
{
  const header = fs.readFileSync(path.join(root, "ui/OmegaHeader.tsx"), "utf8");
  assert_(header.includes("useOmegaProjectSave"), "header uses save hook");
  assert_(header.includes("שמור הצעה") || header.includes("saveLabel"), "save label");
  assert_(!header.includes("Save is intentionally a no-op"), "save no longer no-op");

  const setup = fs.readFileSync(
    path.join(root, "quoteWorkflow/QuoteSetupScreen.tsx"),
    "utf8"
  );
  assert_(setup.includes("OpenExistingProjectControl"), "open existing on setup");
  assert_(setup.includes("פתח הצעה קיימת") || setup.includes("OpenExisting"), "open CTA");

  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  assert_(shell.includes("hydrationStatus"), "hydration gate in shell");
  assert_(shell.includes("data-omega-hydration-gate") || shell.includes("HydrationGate"), "gate UI");

  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  assert_(store.includes("openOmegaProjectFile"), "store open action");
  assert_(store.includes("replaceSessionFromHydration"), "atomic hydrate");
  assert_(store.includes("bumpProjectRevision"), "dirty bumps");

  console.log("✓ save/open UI + session wiring");
}

// ── Browser persistence prohibition ────────────────────────────────────────
{
  resetBrowserProjectPersistenceDiagnosticsForTests();
  const diag = getBrowserProjectPersistenceDiagnostics();
  assertEq(diag.localStorageWriteAttempts, 0, "no localStorage");
  assertEq(diag.sessionStorageWriteAttempts, 0, "no sessionStorage");
  assertEq(diag.indexedDbWriteAttempts, 0, "no indexedDb");
  assertEq(diag.opfsWriteAttempts, 0, "no opfs");
  assertEq(diag.cacheStorageWriteAttempts, 0, "no cacheStorage");
  assert_(OMEGA_PROJECT_NEVER_PERSISTS_TO_BROWSER_STORAGE, "never-persist constant");

  const omegaFiles = fs.readdirSync(omegaRoot);
  for (const name of omegaFiles) {
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(omegaRoot, name), "utf8");
    assert_(
      !/\blocalStorage\.(setItem|removeItem)\b/.test(src),
      `${name} no localStorage write`
    );
    assert_(
      !/\bsessionStorage\.(setItem|removeItem)\b/.test(src),
      `${name} no sessionStorage write`
    );
    assert_(
      !/\bindexedDB\.(open|deleteDatabase)\b/.test(src),
      `${name} no indexedDB API`
    );
    assert_(!/caches\.open\s*\(/.test(src), `${name} no cache storage`);
    assert_(
      !/navigator\.storage\.getDirectory/.test(src),
      `${name} no OPFS`
    );
  }
  console.log("✓ no browser project persistence");
}

// ── Archive security ───────────────────────────────────────────────────────
{
  assert.throws(() => assertSafeArchivePath("../etc/passwd"), /ניווט|נתיב/);
  assert.throws(() => assertSafeArchivePath("/abs/path"), /מוחלט|absolute/i);
  assert.throws(() => assertSafeArchivePath("..\\windows"), /ניווט|נתיב/);
  assertEq(
    assertSafeArchivePath("sources/dxf/a.dxf"),
    "sources/dxf/a.dxf",
    "safe path ok"
  );
  console.log("✓ archive path security");
}

// ── Schema migration gate ──────────────────────────────────────────────────
{
  assert.throws(
    () =>
      migrateOmegaProject({
        schemaVersion: "omega-project-state/v99",
        quotationId: "x",
      }),
    /גרסה חדשה יותר/
  );
  assert.throws(() => migrateOmegaProject({ foo: 1 }), /תקין|recognized/);
  console.log("✓ schema migration rejects future/unknown");
}

async function runAsyncChecks(): Promise<void> {
// ── Round-trip save → load ─────────────────────────────────────────────────
{
  resetDiagnostics();
  resetLoadCounters();
  resetProjectDirtyState();
  clearGeometryCache();

  const session = minimalSession();
  bumpProjectRevision();
  assert_(hasUnsavedProjectChanges(), "dirty after edit");

  const { snapshot, binaries, derivedJson } =
    await createOmegaProjectSnapshot(session);

  assertEq(snapshot.schemaVersion, OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION, "state schema");
  assertEq(snapshot.quoteStage, "UNIFIED_REVIEW", "stage saved");
  assertEq(snapshot.forcedReviewWorkspaceView, "FINAL_TABLE", "final table view");
  assert_(snapshot.frozenMaterialRows.row1, "freeze saved");
  assertEq(
    snapshot.materialRowUserResolutions.row1?.dimensionDecision,
    "USE_DXF_DIMENSIONS",
    "USE_DXF_DIMENSIONS saved"
  );
  assertEq(
    snapshot.quoteItemCommercialOptions.row1?.finish,
    "BLACK",
    "finish saved"
  );
  assert_(
    snapshot.weightPricingDraft?.groupPricingByKey.g1?.manualFinalPricePerKg ===
      11.5,
    "manual price saved"
  );
  assert_(
    snapshot.weightPricingNestingCache?.estimatesBySignature.sig1?.status ===
      "READY",
    "nesting saved"
  );
  assertEq(snapshot.finalQuotationDraft?.notes, "הערת בדיקה", "notes saved");
  assert_(
    JSON.stringify(snapshot).includes("[REDACTED]"),
    "apiKey redacted in snapshot"
  );
  assert_(
    !JSON.stringify(snapshot).includes("SECRET_SHOULD_REDACT"),
    "secret value absent"
  );

  // No base64 of binaries in state JSON
  const stateJson = JSON.stringify(snapshot);
  assert_(!/"data:application/.test(stateJson), "no data-url binaries");
  assert_(binaries.length >= 2, "workbook + dxf binaries");
  assert_(
    binaries.every((b) => b.bytes.byteLength > 0),
    "binary bytes present"
  );

  const { blob, manifest, entryCount } = await buildOmegaProjectArchive({
    session,
    snapshot,
    binaries,
    derivedJson,
  });

  assertEq(manifest.format, OMEGA_PROJECT_FORMAT, "manifest format");
  assertEq(
    manifest.schemaVersion,
    OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION,
    "manifest schema"
  );
  assert_(entryCount >= 5, "multiple archive entries");
  assert_(
    manifest.fileEntries.some((e) => e.kind === "SOURCE_MATERIAL"),
    "material list in manifest"
  );
  assert_(
    manifest.fileEntries.some((e) => e.kind === "SOURCE_DXF"),
    "dxf in manifest"
  );
  assert_(derivedJson[OMEGA_PROJECT_PATHS.DERIVED_DIR + "dxf-geometries.json"] ||
    derivedJson["derived/dxf-geometries.json"], "geometries derived bag");

  const file = new File([blob], "SEGMENT-test.segment", {
    type: "application/vnd.segment.quotation+zip",
  });

  // Inspect zip with JSZip
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  assert_(zip.file(OMEGA_PROJECT_PATHS.MANIFEST), "manifest.json present");
  assert_(zip.file(OMEGA_PROJECT_PATHS.STATE), "state.json present");
  const stateEntry = zip.file(OMEGA_PROJECT_PATHS.STATE);
  const stateText = await stateEntry!.async("string");
  assert_(!stateText.includes("SECRET_SHOULD_REDACT"), "no secret in zip state");

  markProjectExported();
  assert_(!hasUnsavedProjectChanges(), "clean after export");

  const loaded = await loadOmegaProjectFile(file);
  assertEq(loaded.snapshot.quoteDetails?.projectName, "פרויקט בדיקה", "project restored");
  assertEq(loaded.snapshot.quoteStage, "UNIFIED_REVIEW", "stage restored");
  assertEq(
    loaded.snapshot.finalQuotationDraft?.metadata.quotationNumber,
    "P2026001",
    "quotation number restored"
  );
  assertEq(
    loaded.snapshot.weightPricingNestingCache?.estimatesBySignature.sig1
      ?.utilizationPercent,
    72.5,
    "nesting restored"
  );
  assert_(loaded.geometries.length >= 1, "geometries loaded");
  setGeometryEntries(loaded.geometries);
  assert_(
    getGeometryByFilename("5P1.dxf") !== undefined,
    "geometry cache hydrated"
  );

  const { workbookFile, dxfFiles } = filesFromBinaryAssets(
    loaded.snapshot.sourceAssetRefs,
    loaded.binaryAssets
  );
  assert_(workbookFile?.name === "list.xlsx", "workbook filename preserved");
  assert_(dxfFiles.some((f) => f.name === "5P1.dxf"), "dxf filename preserved");

  const hydrated = buildHydratedSession(
    loaded.snapshot,
    workbookFile,
    dxfFiles
  );
  assertEq(hydrated.quoteStage, "UNIFIED_REVIEW", "hydrated stage");
  assertEq(hydrated.hydrationStatus, "READY", "hydrated ready");
  assertEq(hydrated.forcedReviewWorkspaceView, "FINAL_TABLE", "view restored");
  assertEq(hydrated.finalQuotationDraft?.notes, "הערת בדיקה", "notes hydrated");

  // Load must not count as AI / matching / nesting runs
  assertEq(getParseInvocationCountDuringLoad("ai"), 0, "zero AI on load");
  assertEq(getParseInvocationCountDuringLoad("matching"), 0, "zero matching on load");
  assertEq(getParseInvocationCountDuringLoad("nesting"), 0, "zero nesting on load");

  const fileDiag = getOmegaProjectFileDiagnostics();
  assert_(fileDiag.loadCount >= 1, "load counted");
  assertEq(fileDiag.hashMismatchCountLastLoad, 0, "hashes ok");

  console.log("✓ round-trip archive + hydrate");
}

// ── Incomplete AI snapshot ─────────────────────────────────────────────────
{
  const analyzing = minimalSession({
    status: "ANALYZING",
    analyzingLabel: "מנתח...",
    materialListRows: [],
    extractedRows: [],
  });
  const { snapshot } = await createOmegaProjectSnapshot(analyzing);
  assertEq(snapshot.status, "FILES_READY", "analyzing normalized");
  assertEq(snapshot.analyzingLabel, null, "no stuck analyzing label");
  console.log("✓ incomplete AI saves stable pre-analysis stage");
}

// ── Hash mismatch rejected ─────────────────────────────────────────────────
{
  const session = minimalSession();
  const { snapshot, binaries, derivedJson } =
    await createOmegaProjectSnapshot(session);
  const { blob } = await buildOmegaProjectArchive({
    session,
    snapshot,
    binaries,
    derivedJson,
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  // Tamper the required project state while keeping the old manifest hash.
  zip.file(OMEGA_PROJECT_PATHS.STATE, JSON.stringify({ tampered: true }));
  const tampered = await zip.generateAsync({ type: "uint8array" });
  const tamperedAb = tampered.buffer.slice(
    tampered.byteOffset,
    tampered.byteOffset + tampered.byteLength
  ) as ArrayBuffer;
  const badFile = new File([tamperedAb], "bad.segment", {
    type: "application/vnd.segment.quotation+zip",
  });
  let rejected = false;
  try {
    await loadOmegaProjectFile(badFile);
  } catch (err) {
    rejected = true;
    const msg = err instanceof Error ? err.message : String(err);
    assert_(
      /גיבוב|checksum|פגום|JSON|תקין|schema/i.test(msg),
      `expected integrity error, got: ${msg}`
    );
  }
  assert_(rejected, "tampered archive must be rejected");
  console.log("✓ hash mismatch rejected");
}

// ── Dirty / beforeunload wiring present ────────────────────────────────────
{
  const beforeUnload = fs.readFileSync(
    path.join(omegaRoot, "OmegaProjectBeforeUnload.tsx"),
    "utf8"
  );
  assert_(beforeUnload.includes("beforeunload"), "beforeunload handler");
  assert_(beforeUnload.includes("hasUnsavedProjectChanges"), "dirty check");
  assert_(!beforeUnload.includes("localStorage"), "beforeunload no persist");
  console.log("✓ dirty-state browser-close warning");
}
}

runAsyncChecks()
  .then(() => {
    console.log(
      "\nOMEGA — Portable Quotation Project Save and Restore v1 — tests passed."
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
