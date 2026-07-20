/**
 * OMEGA Simple Intake — LlamaExtract Workbook Extraction POC v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-llama-extract-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import { FIXED_TABLE_COLUMN_HEADERS } from "../results/tableContract";
import {
  adaptLlamaExtractRows,
  buildLlamaDataSchema,
  getSimpleWorkbookExtractionProvider,
  LLAMA_EXTRACT_SYSTEM_PROMPT,
  llamaMaterialRowSchema,
} from "../extraction";

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

function withEnv(
  key: string,
  value: string | undefined,
  fn: () => void
): void {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

function run(): void {
  console.log("=== LlamaExtract Workbook Extraction POC v1 ===\n");

  // Provider selection
  {
    withEnv("SIMPLE_INTAKE_EXTRACTION_PROVIDER", "openai", () => {
      assertEq(getSimpleWorkbookExtractionProvider(), "openai", "openai");
    });
    withEnv("SIMPLE_INTAKE_EXTRACTION_PROVIDER", "llama-extract", () => {
      assertEq(
        getSimpleWorkbookExtractionProvider(),
        "llama-extract",
        "llama"
      );
    });
    withEnv("SIMPLE_INTAKE_EXTRACTION_PROVIDER", undefined, () => {
      assertEq(getSimpleWorkbookExtractionProvider(), "openai", "default");
    });
    console.log("✓ Provider selection from environment");
  }

  // Schema / prompt / no DXF
  {
    const schema = buildLlamaDataSchema();
    assertEq(schema.type, "object", "object root");
    const blob = JSON.stringify(schema) + LLAMA_EXTRACT_SYSTEM_PROMPT;
    assert(!/dxf/i.test(blob), "no DXF in schema/prompt");
    assert(LLAMA_EXTRACT_SYSTEM_PROMPT.includes("grand totals"), "exclude totals");
    assert(
      LLAMA_EXTRACT_SYSTEM_PROMPT.includes("Never stop after the first table"),
      "full workbook"
    );
    console.log("✓ Schema object root + no DXF + instructions");
  }

  // Adapter: zeros, nulls, qty 16 one row, profile dims
  {
    const { rows, diagnostics } = adaptLlamaExtractRows(
      [
        {
          sheetName: "Mat",
          sourceRow: 10,
          sourceCell: "A10",
          partId: null,
          profile: "PL25*495",
          description: null,
          quantity: 16,
          material: null,
          thicknessMm: 25,
          widthMm: 495,
          lengthMm: 1200,
          sourceAreaM2: 0,
          sourceWeightKg: 0,
        },
        {
          sheetName: "Mat",
          sourceRow: 11,
          sourceCell: null,
          partId: "P1",
          profile: null,
          description: null,
          quantity: null,
          material: "S355",
          thicknessMm: null,
          widthMm: null,
          lengthMm: null,
          sourceAreaM2: null,
          sourceWeightKg: null,
        },
      ],
      null
    );
    assertEq(rows.length, 2, "two rows");
    assertEq(rows[0]!.quantity, 16, "qty 16 single row");
    assertEq(rows[0]!.sourceAreaM2, 0, "zero area");
    assertEq(rows[0]!.sourceWeightKg, 0, "zero weight");
    assertEq(rows[0]!.material, null, "missing material stays null");
    assertEq(rows[0]!.thicknessMm, 25, "thickness from profile path");
    assertEq(rows[0]!.widthMm, 495, "width from profile path");
    assertEq(rows[1]!.quantity, null, "null qty");
    assert(diagnostics.sourceCoverage.totalRows === 2, "coverage");
    console.log("✓ Adapter preserves zeros/nulls; qty 16 is one row");
  }

  // Non-positive dimensions become null (shared AI contract)
  {
    const { rows } = adaptLlamaExtractRows(
      [
        {
          sheetName: "S",
          sourceRow: 1,
          sourceCell: null,
          partId: null,
          profile: "PL10*10",
          description: null,
          quantity: 1,
          material: "S235",
          thicknessMm: 0,
          widthMm: -5,
          lengthMm: 0,
          sourceAreaM2: 0,
          sourceWeightKg: 0,
        },
      ],
      null
    );
    assertEq(rows.length, 1, "one row");
    assertEq(rows[0]!.thicknessMm, null, "thickness 0→null");
    assertEq(rows[0]!.widthMm, null, "width neg→null");
    assertEq(rows[0]!.lengthMm, null, "length 0→null");
    assertEq(rows[0]!.sourceAreaM2, 0, "area zero kept");
    console.log("✓ Non-positive dimensions coerced to null");
  }

  // Exact duplicate vs conflict
  {
    const dup = adaptLlamaExtractRows(
      [
        {
          sheetName: "S",
          sourceRow: 2,
          sourceCell: "A2",
          partId: null,
          profile: "PL10*10",
          description: null,
          quantity: 1,
          material: "S235",
          thicknessMm: 10,
          widthMm: 10,
          lengthMm: 100,
          sourceAreaM2: null,
          sourceWeightKg: null,
        },
        {
          sheetName: "S",
          sourceRow: 2,
          sourceCell: "A2",
          partId: null,
          profile: "PL10*10",
          description: null,
          quantity: 1,
          material: "S235",
          thicknessMm: 10,
          widthMm: 10,
          lengthMm: 100,
          sourceAreaM2: null,
          sourceWeightKg: null,
        },
      ],
      null
    );
    assertEq(dup.rows.length, 1, "exact dup removed");
    assertEq(dup.diagnostics.exactDuplicatesRemoved, 1, "dup count");
    assertEq(dup.conflictFatal, false, "not fatal");

    const conflict = adaptLlamaExtractRows(
      [
        {
          sheetName: "S",
          sourceRow: 3,
          sourceCell: "A3",
          partId: null,
          profile: "PL10*10",
          description: null,
          quantity: 1,
          material: "S235",
          thicknessMm: 10,
          widthMm: 10,
          lengthMm: 100,
          sourceAreaM2: null,
          sourceWeightKg: null,
        },
        {
          sheetName: "S",
          sourceRow: 3,
          sourceCell: "A3",
          partId: null,
          profile: "PL10*10",
          description: null,
          quantity: 2,
          material: "S235",
          thicknessMm: 10,
          widthMm: 10,
          lengthMm: 100,
          sourceAreaM2: null,
          sourceWeightKg: null,
        },
      ],
      null
    );
    assert(conflict.conflictFatal, "conflict fatal");
    assert(conflict.diagnostics.duplicateConflicts.length >= 1, "conflict listed");
    console.log("✓ Duplicate provenance handling");
  }

  // Missing source-row provenance diagnosed
  {
    const { rows, diagnostics } = adaptLlamaExtractRows(
      [
        {
          sheetName: "S",
          sourceRow: null,
          sourceCell: null,
          partId: null,
          profile: "PL1*1",
          description: null,
          quantity: 1,
          material: null,
          thicknessMm: 1,
          widthMm: 1,
          lengthMm: 1,
          sourceAreaM2: null,
          sourceWeightKg: null,
        },
      ],
      null
    );
    assertEq(rows.length, 1, "row kept");
    assert(diagnostics.provenanceFallbackCount >= 1, "fallback");
    assert(
      (rows[0]!.note ?? "").includes("PROVENANCE_FALLBACK"),
      "fallback note"
    );
    console.log("✓ Missing source-row provenance diagnosed");
  }

  // Invalid entity counted
  {
    const { diagnostics } = adaptLlamaExtractRows(
      [
        { sheetName: "S", sourceRow: 1.5, quantity: 1 },
        { sheetName: "S", sourceRow: 2, quantity: 1 },
      ],
      null
    );
    assert(diagnostics.invalidRowCount >= 1, "invalid counted");
    console.log("✓ Invalid provider output handled");
  }

  // Zod row schema accepts zeros
  {
    const ok = llamaMaterialRowSchema.safeParse({
      sheetName: "S",
      sourceRow: 1,
      sourceCell: null,
      partId: null,
      profile: null,
      description: null,
      quantity: 0,
      material: null,
      thicknessMm: null,
      widthMm: null,
      lengthMm: null,
      sourceAreaM2: 0,
      sourceWeightKg: 0,
    });
    assert(ok.success, "zeros valid");
    console.log("✓ Explicit zeros accepted by Llama schema");
  }

  // Wiring files
  {
    const root = path.resolve(__dirname, "..");
    const route = fs.readFileSync(
      path.join(root, "../../app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("getSimpleWorkbookExtractionProvider"), "provider switch");
    assert(route.includes("runLlamaExtractWorkbook"), "llama runner");
    assert(route.includes("runOpenAiWorkbookExtraction"), "openai kept");
    assert(route.includes("multipart/form-data"), "multipart");
    assert(route.includes("workbook"), "workbook field");
    assert(!route.includes("OPENAI_EXTRACTION_MODEL"), "no shared model env");

    const llamaRun = fs.readFileSync(
      path.join(root, "extraction/llamaExtract/runLlamaExtract.ts"),
      "utf8"
    );
    assert(llamaRun.includes('purpose: "extract"'), "upload purpose");
    assert(llamaRun.includes('extraction_target: "per_table_row"'), "target");
    assert(llamaRun.includes("cite_sources: true"), "cite");
    assert(llamaRun.includes("confidence_scores: true"), "confidence");
    assert(llamaRun.includes("files.create"), "upload");
    assert(llamaRun.includes("extract.create"), "v2 create");
    assert(llamaRun.includes("planLlamaWorkbookChunks"), "chunk plan");
    assert(llamaRun.includes("workbookChunking"), "chunk debug");
    assert(!/dxf/i.test(llamaRun.split("HEBREW_FAIL")[0] ?? ""), "no dxf early");

    const chunker = fs.readFileSync(
      path.join(root, "extraction/llamaExtract/chunkWorkbookForLlamaExtract.ts"),
      "utf8"
    );
    assert(chunker.includes("LLAMA_TABULAR_SAFE_ROWS_PER_CHUNK"), "safe limit");
    assert(chunker.includes("isTabularMaxItemsError"), "tabular detector");
    assert(chunker.includes("remapDenseExtractResult"), "dense remap");
    assert(chunker.includes("buildDenseChunkWorkbook"), "dense builder");
    assert(llamaRun.includes("adaptiveResplits"), "adaptive resplit");
    assert(llamaRun.includes("remapDenseExtractResult"), "runner remaps");

    const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
    assert(store.includes("FormData"), "client FormData");
    assert(store.includes('"workbook"'), "sends workbook");
    assert(store.includes("workbookFile"), "original file");
    assert(store.includes("קוראים את קובץ האקסל"), "hebrew analyzing");

    const debug = fs.readFileSync(path.join(root, "buildSimpleDebug.ts"), "utf8");
    assert(debug.includes("extractionProvider"), "debug provider");

    assertEq(FIXED_TABLE_COLUMN_HEADERS.length, 12, "table cols unchanged");

    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "../../package.json"), "utf8")
    ) as { dependencies: Record<string, string> };
    assert(
      Boolean(pkg.dependencies["@llamaindex/llama-cloud"]),
      "sdk installed"
    );

    const envEx = fs.readFileSync(
      path.join(root, "../../.env.example"),
      "utf8"
    );
    assert(envEx.includes("SIMPLE_INTAKE_EXTRACTION_PROVIDER"), "env provider");
    assert(envEx.includes("LLAMA_CLOUD_API_KEY"), "env key");
    assert(envEx.includes("LLAMA_EXTRACT_TIER"), "env tier");

    // No API key leakage patterns in llama runner source literals
    assert(!llamaRun.includes("sk-"), "no key literal");

    console.log("✓ Wiring: upload flow, v2 config, debug, env, SDK");
  }

  // Readiness / table untouched (spot-check presence)
  {
    const root = path.resolve(__dirname, "..");
    assert(
      fs.existsSync(path.join(root, "readiness/ReadinessSummary.tsx")),
      "readiness exists"
    );
    assert(
      fs.existsSync(path.join(root, "results/tableContract.ts")),
      "table contract exists"
    );
    console.log("✓ Existing readiness + final table remain present");
  }

  console.log(
    "\n=== All LlamaExtract Workbook Extraction POC v1 tests passed ==="
  );
}

run();
