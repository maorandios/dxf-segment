/**
 * Developer Debug Bundle v1 tests.
 * Run: npx tsx lib/ai-intake/__tests__/developer-debug-bundle.ts
 */

import {
  buildOmegaIntakeDeveloperDebug,
  DebugRunCollector,
  downloadOmegaIntakeDeveloperDebug,
  serializeOmegaIntakeDeveloperDebug,
  toJsonSafeWithCycles,
  validateOmegaIntakeDeveloperDebug,
} from "../debug/developer-bundle";
import { interpretWorkbook } from "../workbook/interpreter";
import type { WorkbookCellEvidence, WorkbookSnapshot } from "../normalization/types";

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

function cell(
  sheetName: string,
  address: string,
  raw: string | number | null
): WorkbookCellEvidence {
  const m = address.match(/^([A-Z]+)(\d+)$/i)!;
  return {
    sheetName,
    cellAddress: address.toUpperCase(),
    rawValue: raw,
    formattedText: raw == null ? null : String(raw),
    formula: null,
    formulaResult: null,
    numberFormat: null,
    rowNumber: Number(m[2]),
    columnLetter: m[1]!.toUpperCase(),
    isMerged: false,
    mergedRange: null,
    isHiddenRow: false,
    isHiddenColumn: false,
  };
}

function ordinarySnap(): WorkbookSnapshot {
  return {
    documentId: "doc:dbg-ordinary",
    fileName: "ordinary.xlsx",
    parserKind: "EXCELJS_XLSX",
    sheets: [
      {
        sheetName: "Sheet1",
        usedRange: "A1:D10",
        mergedRanges: [],
        hidden: false,
        cells: [
          cell("Sheet1", "A1", "Part Mark"),
          cell("Sheet1", "B1", "Qty"),
          cell("Sheet1", "C1", "Material"),
          cell("Sheet1", "D1", "Thickness (mm)"),
          cell("Sheet1", "A2", "P1001"),
          cell("Sheet1", "B2", 2),
          cell("Sheet1", "C2", "S355"),
          cell("Sheet1", "D2", 12),
        ],
      },
    ],
    warnings: [],
  };
}

async function run(): Promise<void> {
  console.log("=== Developer Debug Bundle v1 ===");

  // T1 success bundle from interpreter + collector
  {
    const snapshot = ordinarySnap();
    const interpreted = await interpretWorkbook({
      snapshot,
      allowAiPlanner: false,
    });
    assertEq(interpreted.status, "SUCCESS", "T1 interpret");

    const collector = new DebugRunCollector();
    collector.begin("FILE_PREFLIGHT");
    collector.end("FILE_PREFLIGHT", "SUCCEEDED");
    collector.begin("WORKBOOK_SNAPSHOT");
    collector.end("WORKBOOK_SNAPSHOT", "SUCCEEDED");
    collector.begin("INITIAL_PLAN_EXECUTION");
    collector.end("INITIAL_PLAN_EXECUTION", "SUCCEEDED", {
      outputSummary: { coverage: interpreted.execution?.coverage },
    });

    const fakeAnalyze = {
      ok: true as const,
      extraction: {
        documentRows: [],
        emailFacts: [],
        unresolvedItems: [],
        warnings: [],
      },
      acceptedFacts: [],
      aggregated: {
        documents: [
          {
            documentId: snapshot.documentId,
            sourceType: "XLSX" as const,
            fileName: snapshot.fileName,
            rows: [],
            unresolvedItems: [],
            warnings: interpreted.warnings,
            status: "SUCCESS" as const,
            errorCode: null,
            usage: {
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
            },
            durationMs: 1,
            workbookEvidence: {
              parserKind: "EXCELJS_XLSX" as const,
              snapshot: null,
              mapping: null,
              coverage: null,
              rawPartRows: interpreted.partRows,
              excludedTotalSubtotalRows: [],
              unknownRows: [],
              hiddenPartRowsRequiringReview: [],
              workbookInterpreterDiagnostics:
                // Use rich summary path via attaching diagnostics object
                interpreted.diagnostics,
            },
          },
        ],
        emailFacts: [],
        expandedFacts: [],
        emailUsage: null,
        emailDurationMs: null,
        openaiCallCount: 0,
        partial: false,
      },
      auditRows: [],
      auditSummary: {
        matched: 0,
        mappingRequiresReview: 0,
        requestPartNotInDxf: 0,
        dxfNotRequested: 0,
        ambiguous: 0,
      },
      finalRows: [],
      warnings: [],
      partial: false,
      debug: {
        model: "none",
        durationMs: 1,
        openaiCallCount: 0,
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
        },
        perSourceUsage: [],
      },
    };

    // Attach summary form as production does
    const { workbookInterpreterDebugSummary } = await import(
      "../workbook/interpreter/workbookInterpreterDebug"
    );
    (
      fakeAnalyze.aggregated.documents[0]!.workbookEvidence as {
        workbookInterpreterDiagnostics: unknown;
      }
    ).workbookInterpreterDiagnostics = workbookInterpreterDebugSummary(
      interpreted.diagnostics
    );

    const bundle = buildOmegaIntakeDeveloperDebug({
      entryPoint: "QUOTE_WORKSPACE",
      quoteId: "q-test",
      projectName: "Debug Project",
      customerName: "Cust",
      currentStep: "COMPLETE",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sources: [
        {
          sourceId: "s1",
          fileName: "ordinary.xlsx",
          extension: ".xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          sizeBytes: 1000,
          fingerprint: "abc",
          kind: "XLSX",
          status: "PROCESSED",
          blockingReason: null,
        },
        {
          sourceId: "s2",
          fileName: "P1001.dxf",
          extension: ".dxf",
          mimeType: "application/dxf",
          sizeBytes: 200,
          fingerprint: "def",
          kind: "DXF",
          status: "PROCESSED",
          blockingReason: null,
        },
      ],
      collector,
      analyze: fakeAnalyze as never,
      reviewSession: null,
      dxfRegistry: [],
      analysisErrorHe: null,
      exception: null,
    });

    const v = validateOmegaIntakeDeveloperDebug(bundle);
    assert(v.ok, `T1 valid ${v.errors.join(",")}`);
    assertEq(bundle.schemaVersion, "omega-intake-developer-debug/v1", "T1 schema");
    assert(bundle.stageTimeline.length >= 3, "T1 stages");
    assert(bundle.workbookRuns.length === 1, "T1 workbook runs");
    assert(bundle.inputManifest.length === 2, "T1 manifest");
    assert(bundle.privacy.noApiKeys === true, "T1 privacy");
    console.log("T1 success bundle OK", bundle.bundleSize.estimatedUncompressedBytes);
  }

  // T2 early failure still produces bundle
  {
    const collector = new DebugRunCollector();
    collector.begin("FILE_PREFLIGHT");
    collector.end("FILE_PREFLIGHT", "FAILED", {
      errorCode: "NO_FILES",
      errorMessage: "no files",
    });
    const bundle = buildOmegaIntakeDeveloperDebug({
      entryPoint: "QUOTE_WORKSPACE",
      quoteId: "q-fail",
      projectName: "Fail",
      customerName: "C",
      currentStep: "FILES",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sources: [],
      collector,
      analyze: null,
      reviewSession: null,
      dxfRegistry: null,
      analysisErrorHe: "שגיאה",
      exception: null,
    });
    assert(validateOmegaIntakeDeveloperDebug(bundle).ok, "T2 valid");
    assert(bundle.failureSummary != null, "T2 failure summary");
    assertEq(bundle.finalOutcome.status, "FAILED", "T2 status");
    console.log("T2 early failure OK");
  }

  // T6/T7 row ledger completeness from interpreter
  {
    const interpreted = await interpretWorkbook({
      snapshot: ordinarySnap(),
      allowAiPlanner: false,
    });
    const ledger = interpreted.execution?.rowLedger ?? [];
    assert(ledger.length >= 1, "T6 ledger");
    const declared = interpreted.execution?.coverage.declaredDataRows ?? 0;
    assertEq(ledger.length, declared, "T6 ledger equals declared");
    assertEq(
      interpreted.execution?.coverage.unexplainedRows,
      0,
      "T7 no silent loss"
    );
    console.log("T6/T7 ledger OK", ledger.length);
  }

  // T15 planner call cap recorded
  {
    const interpreted = await interpretWorkbook({
      snapshot: ordinarySnap(),
      allowAiPlanner: false,
    });
    assert(interpreted.diagnostics.plannerCallCount <= 2, "T15 cap");
    assert(Array.isArray(interpreted.diagnostics.plannerAttempts), "T15 attempts");
    console.log("T15 call cap OK");
  }

  // T17 binary exclusion
  {
    const fileLike = {
      name: "x.xlsx",
      size: 99,
      type: "application/octet-stream",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    };
    const safe = toJsonSafeWithCycles({
      file: typeof File !== "undefined"
        ? new File([new Uint8Array([1, 2, 3])], "x.xlsx")
        : fileLike,
      buf: new ArrayBuffer(4),
      apiKey: "sk-secretsecret",
      authorization: "Bearer tok",
    }) as Record<string, unknown>;
    const json = JSON.stringify(safe);
    assert(!json.includes("sk-secret"), "T17/T18 secret");
    assert(!json.includes("Bearer tok"), "T18 auth");
    assert(!json.includes('"\\u0001'), "T17 no binary");
    console.log("T17/T18 binary+secret OK");
  }

  // T19 cyclic
  {
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    const json = serializeOmegaIntakeDeveloperDebug({ cycle: a, schemaVersion: "omega-intake-developer-debug/v1", run: {}, stageTimeline: [], inputManifest: [], finalOutcome: {}, invariantChecks: [] });
    assert(json.includes("[Circular]"), "T19 circular");
    console.log("T19 cyclic OK");
  }

  // T22 observational — interpret twice same output
  {
    const snap = ordinarySnap();
    const a = await interpretWorkbook({ snapshot: snap, allowAiPlanner: false });
    const b = await interpretWorkbook({ snapshot: snap, allowAiPlanner: false });
    assertEq(
      JSON.stringify(a.partRows),
      JSON.stringify(b.partRows),
      "T22 observational"
    );
    console.log("T22 observational OK");
  }

  // download helper returns filename without throwing in node
  {
    const { filename } = downloadOmegaIntakeDeveloperDebug({
      bundle: {
        schemaVersion: "omega-intake-developer-debug/v1",
        run: {},
        stageTimeline: [],
        inputManifest: [],
        finalOutcome: { status: "FAILED" },
        invariantChecks: [],
      },
      projectName: "Test Project",
    });
    assert(filename.includes("omega-debug"), "download name");
    console.log("download helper OK", filename);
  }

  console.log("=== Developer Debug Bundle v1 PASSED ===");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
