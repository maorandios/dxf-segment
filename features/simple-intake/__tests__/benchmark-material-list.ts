/**
 * Developer benchmark helper for Stage 1 material-list extraction.
 *
 * Expected benchmark material rows (manual reference only): 158
 * Never use that number in production logic.
 *
 * Usage (with credentials):
 *   npx tsx features/simple-intake/__tests__/benchmark-material-list.ts path/to.xlsx [runs]
 */

import fs from "node:fs";
import path from "node:path";
import { buildSimpleWorkbookSnapshot } from "../buildSimpleWorkbookSnapshot";
import { runOpenAiMaterialListExtraction } from "../materialList/openaiMaterialListExtract";
import { EXPECTED_BENCHMARK_MATERIAL_ROWS } from "../materialList/types";
import { effectiveMaterialFields } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";

/** Approximate list prices ($ / 1M tokens) for reporting only — not billing. */
const EST_INPUT_PER_M = 0.25;
const EST_OUTPUT_PER_M = 2.0;

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function fingerprint(row: MaterialListRow): string {
  const e = effectiveMaterialFields(row);
  return JSON.stringify({
    sheetName: row.sheetName,
    sourceRow: row.sourceRow,
    partId: e.partId,
    profile: e.profile,
    material: e.material,
    thicknessMm: e.thicknessMm,
    quantity: e.quantity,
    widthMm: e.widthMm,
    lengthMm: e.lengthMm,
  });
}

function totalUnits(rows: MaterialListRow[]): number {
  let sum = 0;
  for (const row of rows) {
    const q = effectiveMaterialFields(row).quantity;
    if (typeof q === "number" && Number.isFinite(q)) sum += q;
  }
  return sum;
}

function estimateCostUsd(
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (inputTokens == null || outputTokens == null) return null;
  return (
    (inputTokens / 1_000_000) * EST_INPUT_PER_M +
    (outputTokens / 1_000_000) * EST_OUTPUT_PER_M
  );
}

async function main(): Promise<void> {
  loadEnvLocal();
  const filePath = process.argv[2];
  const runs = Math.max(1, Number(process.argv[3] ?? 5));
  if (!filePath) {
    console.error(
      "Usage: npx tsx features/simple-intake/__tests__/benchmark-material-list.ts <workbook.xlsx> [runs]"
    );
    console.error(
      `Manual reference (not production): Expected benchmark material rows: ${EXPECTED_BENCHMARK_MATERIAL_ROWS}`
    );
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  const bytes = fs.readFileSync(abs);
  const file = new File([bytes], path.basename(abs));
  const snap = await buildSimpleWorkbookSnapshot({
    file,
    workbookId: "benchmark",
  });
  if (!snap.ok) {
    console.error(snap.message);
    process.exit(1);
  }

  const fingerprints: string[][] = [];
  const runReports: unknown[] = [];
  for (let i = 0; i < runs; i++) {
    const started = Date.now();
    const out = await runOpenAiMaterialListExtraction({
      snapshot: snap.snapshot,
    });
    const fps = out.rows.map(fingerprint).sort();
    fingerprints.push(fps);
    const units = totalUnits(out.rows);
    const sourceRows = out.rows
      .map((r) => r.sourceRow)
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    const report = {
      run: i + 1,
      model: out.model,
      rowCount: out.rows.length,
      totalUnits: units,
      sourceRowCount: sourceRows.length,
      durationMs: Date.now() - started,
      usage: out.usage,
      estimatedCostUsd: estimateCostUsd(
        out.usage.inputTokens,
        out.usage.outputTokens
      ),
      reference: {
        expectedRows: EXPECTED_BENCHMARK_MATERIAL_ROWS,
        expectedUnits: 1902,
      },
      matchesReference:
        out.rows.length === EXPECTED_BENCHMARK_MATERIAL_ROWS && units === 1902,
    };
    runReports.push(report);
    console.log(JSON.stringify(report, null, 2));
  }

  const base = fingerprints[0] ?? [];
  for (let i = 1; i < fingerprints.length; i++) {
    const cur = fingerprints[i]!;
    const baseSet = new Set(base);
    const curSet = new Set(cur);
    const missing = base.filter((f) => !curSet.has(f));
    const added = cur.filter((f) => !baseSet.has(f));
    console.log(
      JSON.stringify(
        {
          compareToRun1: i + 1,
          exactEqual: missing.length === 0 && added.length === 0,
          missing: missing.length,
          added: added.length,
        },
        null,
        2
      )
    );
  }

  const allStable = fingerprints.every(
    (fps) =>
      fps.length === base.length && fps.every((f, idx) => f === base[idx])
  );
  console.log(
    JSON.stringify(
      {
        summary: {
          configuredModel: process.env.SIMPLE_INTAKE_OPENAI_MODEL ?? null,
          runs,
          allFingerprintsStable: allStable,
          runReports,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
