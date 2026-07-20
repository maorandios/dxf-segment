/**
 * Developer benchmark helper for Stage 1 material-list extraction + quality gate.
 *
 * Expected benchmark material rows (manual reference only): 158 / 1902 units
 * Never use those numbers in production logic.
 *
 * Usage (with credentials):
 *   npx tsx features/simple-intake/__tests__/benchmark-material-list.ts path/to.xlsx [runs]
 */

import fs from "node:fs";
import path from "node:path";
import { buildSimpleWorkbookSnapshot } from "../buildSimpleWorkbookSnapshot";
import { runOpenAiMaterialListExtraction } from "../materialList/openaiMaterialListExtract";
import {
  EXPECTED_BENCHMARK_MATERIAL_ROWS,
  EXPECTED_BENCHMARK_MATERIAL_UNITS,
} from "../materialList/types";
import { effectiveMaterialFields } from "../materialList/completeness";
import { countDuplicateSourceRows } from "../materialList/qualityGate";
import type { MaterialListRow } from "../materialList/types";

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
      .filter((n): n is number => n != null && n > 0);
    const report = {
      run: i + 1,
      model: out.model,
      primaryRowCount:
        (out.materialListStageDebug.adaptDiagnostics as { validatedRowCount?: number })
          ?.validatedRowCount ?? out.rows.length,
      finalCanonicalRowCount: out.rows.length,
      unitCount: units,
      lengthCoverageBefore: out.qualityGate.fieldCoverageBefore.lengthMm,
      lengthCoverageAfter: out.qualityGate.fieldCoverageAfter.lengthMm,
      repairTriggered: out.qualityGate.triggeredRepair,
      duplicateSourceRows: countDuplicateSourceRows(out.rows),
      unresolvedValues: out.qualityGate.unresolvedFieldCount,
      primaryTokens: out.primaryUsage,
      repairTokens: out.targetedRepair.usage,
      providerCallCount: out.providerCallCount,
      primaryCostUsd: out.primaryEstimatedCostUsd,
      repairCostUsd: out.repairEstimatedCostUsd,
      totalCostUsd: out.totalEstimatedCostUsd,
      totalDurationMs: Date.now() - started,
      qualityGatePassed: out.qualityGatePassed,
      reference: {
        expectedRows: EXPECTED_BENCHMARK_MATERIAL_ROWS,
        expectedUnits: EXPECTED_BENCHMARK_MATERIAL_UNITS,
      },
      matchesReference:
        out.rows.length === EXPECTED_BENCHMARK_MATERIAL_ROWS &&
        units === EXPECTED_BENCHMARK_MATERIAL_UNITS &&
        out.qualityGate.fieldCoverageAfter.lengthMm ===
          EXPECTED_BENCHMARK_MATERIAL_ROWS,
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
          compare: `run1 vs run${i + 1}`,
          fingerprintDiff: {
            missingFromRun: missing.length,
            addedInRun: added.length,
          },
        },
        null,
        2
      )
    );
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          runs,
          referenceRows: EXPECTED_BENCHMARK_MATERIAL_ROWS,
          referenceUnits: EXPECTED_BENCHMARK_MATERIAL_UNITS,
        },
        runs: runReports,
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
