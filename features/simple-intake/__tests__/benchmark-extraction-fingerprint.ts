/**
 * Developer-only Simple Intake extraction fingerprint benchmark.
 *
 * Usage:
 *   npx tsx features/simple-intake/__tests__/benchmark-extraction-fingerprint.ts [path-to.xlsx]
 *
 * When SIMPLE_INTAKE_EXTRACTION_PROVIDER=llama-extract and LLAMA_CLOUD_API_KEY
 * is set, runs LlamaExtract against the original workbook repeatedly.
 *
 * Known large-workbook manual reference (documentation only — not a production rule):
 *   158 genuine material rows
 */

import fs from "node:fs";
import path from "node:path";
import {
  adaptLlamaExtractRows,
  getSimpleWorkbookExtractionProvider,
  runLlamaExtractWorkbook,
} from "../extraction";

type FingerprintRow = {
  sheetName: string;
  sourceRow: number;
  profile: string | null;
  quantity: number | null;
  material: string | null;
  thicknessMm: number | null;
  widthMm: number | null;
  lengthMm: number | null;
  sourceAreaM2: number | null;
  sourceWeightKg: number | null;
};

function fingerprint(rows: FingerprintRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    const s = a.sheetName.localeCompare(b.sheetName);
    if (s !== 0) return s;
    return a.sourceRow - b.sourceRow;
  });
  return JSON.stringify(sorted);
}

async function runOnce(filePath: string): Promise<{
  rows: FingerprintRow[];
  durationMs: number;
  usage: unknown;
  coverage: unknown;
}> {
  const provider = getSimpleWorkbookExtractionProvider();
  if (provider !== "llama-extract") {
    throw new Error(
      `Set SIMPLE_INTAKE_EXTRACTION_PROVIDER=llama-extract (got ${provider})`
    );
  }
  const bytes = fs.readFileSync(filePath);
  const out = await runLlamaExtractWorkbook({
    workbookBytes: bytes,
    filename: path.basename(filePath),
  });
  const rows = out.result.rows.map((r) => ({
    sheetName: String(r.sheetName ?? ""),
    sourceRow: Number(r.sourceRow ?? 0),
    profile: (r.profile as string | null) ?? null,
    quantity: (r.quantity as number | null) ?? null,
    material: (r.material as string | null) ?? null,
    thicknessMm: (r.thicknessMm as number | null) ?? null,
    widthMm: (r.widthMm as number | null) ?? null,
    lengthMm: (r.lengthMm as number | null) ?? null,
    sourceAreaM2: (r.sourceAreaM2 as number | null) ?? null,
    sourceWeightKg: (r.sourceWeightKg as number | null) ?? null,
  }));
  return {
    rows,
    durationMs: out.durationMs,
    usage: out.usage,
    coverage:
      (
        out.extractionProviderDebug.adaptDiagnostics as {
          sourceCoverage?: unknown;
        }
      )?.sourceCoverage ?? null,
  };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  const runs = Number(process.argv[3] ?? 2);
  console.log("=== Simple Intake extraction fingerprint benchmark ===");
  console.log(
    "Manual reference for known large workbook: 158 genuine material rows"
  );
  console.log("Provider:", getSimpleWorkbookExtractionProvider());

  if (!filePath) {
    console.log(
      "No workbook path provided — dry check of adapter + provider selection only."
    );
    const adapted = adaptLlamaExtractRows(
      [
        {
          sheetName: "S1",
          sourceRow: 2,
          sourceCell: "A2",
          partId: null,
          profile: "PL10*100",
          description: null,
          quantity: 16,
          material: "S355",
          thicknessMm: 10,
          widthMm: 100,
          lengthMm: 200,
          sourceAreaM2: 0,
          sourceWeightKg: 0,
        },
      ],
      null
    );
    console.log("dry rows:", adapted.rows.length, "qty:", adapted.rows[0]?.quantity);
    console.log("zeros preserved:", adapted.rows[0]?.sourceAreaM2 === 0);
    return;
  }

  const results = [];
  for (let i = 0; i < runs; i++) {
    console.log(`Run ${i + 1}/${runs}...`);
    results.push(await runOnce(filePath));
  }

  const fps = results.map((r) => fingerprint(r.rows));
  const base = fps[0]!;
  const equal = fps.every((f) => f === base);
  console.log({
    runCount: runs,
    rowCounts: results.map((r) => r.rows.length),
    exactFingerprintEquality: equal,
    durationsMs: results.map((r) => r.durationMs),
    usages: results.map((r) => r.usage),
    provenanceCoverage: results.map((r) => r.coverage),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});