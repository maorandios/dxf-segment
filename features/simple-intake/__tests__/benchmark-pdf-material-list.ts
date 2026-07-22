/**
 * PDF material-list smoke benchmark (born-digital fixture).
 * Run: npx tsx features/simple-intake/__tests__/benchmark-pdf-material-list.ts [path.pdf]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOpenAiPdfMaterialListExtraction } from "../materialList/openaiPdfMaterialListExtract";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function main(): Promise<void> {
  loadEnvLocal();
  const defaultFixture = path.join(
    __dirname,
    "fixtures",
    "pdf-benchmark-a-born-digital.pdf"
  );
  const filePath = process.argv[2] ?? defaultFixture;
  if (!fs.existsSync(filePath)) {
    console.error("Missing PDF:", filePath);
    process.exit(1);
  }
  const bytes = fs.readFileSync(filePath);
  const out = await runOpenAiPdfMaterialListExtraction({
    pdfBytes: bytes,
    fileName: path.basename(filePath),
    mimeType: "application/pdf",
  });

  const summary = {
    fileName: path.basename(filePath),
    model: out.model,
    providerCallCount: out.providerCallCount,
    rowCount: out.rows.length,
    qualityGatePassed: out.qualityGatePassed,
    rows: out.rows.map((r) => ({
      rowId: r.rowId,
      sourcePage: r.sourcePage,
      sourceAnchorText: r.sourceAnchorText,
      profile: r.profile,
      material: r.material,
      thicknessMm: r.thicknessMm,
      quantity: r.quantity,
      widthMm: r.widthMm,
      lengthMm: r.lengthMm,
      dxfFileName: r.dxfFileName,
      sheetName: r.sheetName,
      sourceRow: r.sourceRow,
      sourceCell: r.sourceCell,
    })),
    pdfExtraction: out.pdfExtractionDebug,
    sourceDocument: out.sourceDocument,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
