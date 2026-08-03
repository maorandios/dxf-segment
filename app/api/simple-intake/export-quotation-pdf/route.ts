import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildFinalQuotationHtml,
  type FinalQuotationPdfPayload,
} from "@/server/pdf/buildFinalQuotationHtml";
import { htmlToPdfBuffer } from "@/server/pdf/htmlToPdf";
import {
  isPythonMissingError,
  resolvePythonExecutable,
} from "@/server/pdf/resolvePythonExecutable";

export const runtime = "nodejs";
export const maxDuration = 120;

const execFileAsync = promisify(execFile);

/** Kill hung Chromium/Python before Next's route budget is exhausted. */
const PYTHON_PDF_TIMEOUT_MS = 45_000;

const bodySchema = z.object({
  metadata: z.object({
    customer_name: z.string(),
    project_name: z.string(),
    quotation_date: z.string(),
    quotation_validity_date: z.string().optional().default(""),
    quotation_number: z.string(),
  }),
  totals: z.object({
    item_count: z.number().int().nonnegative(),
    total_quantity: z.number().nonnegative(),
    total_weight_kg: z.number().nonnegative(),
    subtotal_before_vat: z.number().nonnegative(),
    vat_rate_percent: z.number().nonnegative(),
    vat_amount: z.number().nonnegative(),
    total_including_vat: z.number().nonnegative(),
  }),
  rows: z
    .array(
      z.object({
        part_id: z.string().min(1),
        thickness_mm: z.number().nonnegative(),
        quantity: z.number().nonnegative(),
        material: z.string().min(1),
        length_mm: z.number().nonnegative(),
        width_mm: z.number().nonnegative(),
        total_weight_kg: z.number().nonnegative(),
        finish: z.string(),
        is_checkered_plate: z.boolean(),
        final_price_per_kg: z.number().nonnegative(),
        line_total: z.number().nonnegative(),
      })
    )
    .min(1),
  notes: z.string().optional().default(""),
  company: z.object({
    name: z.string().min(1),
    email: z.string().optional().default(""),
    address: z.string().optional().default(""),
    registration_number: z.string().optional().default(""),
  }),
});

function safeFilename(ref: string): string {
  const s = ref.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 80);
  return s || "quotation";
}

async function renderWithPython(
  payload: FinalQuotationPdfPayload
): Promise<Buffer> {
  const pdfDir = path.join(process.cwd(), "server", "pdf");
  const scriptPath = path.resolve(pdfDir, "render_final_quotation_pdf.py");
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "omega-final-quote-pdf-"));
  const inputPath = path.join(tmpRoot, "payload.json");
  const outputPath = path.join(tmpRoot, "out.pdf");
  try {
    await writeFile(inputPath, JSON.stringify(payload), "utf8");
    const py = resolvePythonExecutable();
    await execFileAsync(
      py.command,
      [...py.prefixArgs, scriptPath, "--input", inputPath, "--output", outputPath],
      {
        cwd: pdfDir,
        env: { ...process.env, PYTHONUTF8: "1" },
        maxBuffer: 32 * 1024 * 1024,
        timeout: PYTHON_PDF_TIMEOUT_MS,
        killSignal: "SIGTERM",
        windowsHide: true,
      }
    );
    return await readFile(outputPath);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

async function renderWithNode(
  payload: FinalQuotationPdfPayload
): Promise<Buffer> {
  const html = buildFinalQuotationHtml(payload);
  return htmlToPdfBuffer(html);
}

/**
 * POST /api/simple-intake/export-quotation-pdf
 * Renders the Simple Intake final quotation PDF (portrait, classic header).
 * Prefers Python Playwright when available; falls back to Node Chromium
 * (required on Vercel, where `python3` is not installed).
 */
export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    let pdf: Buffer;
    const preferNode =
      process.env.VERCEL === "1" ||
      process.env.FINAL_QUOTATION_PDF_ENGINE === "node";

    if (preferNode) {
      pdf = await renderWithNode(parsed);
    } else {
      try {
        pdf = await renderWithPython(parsed);
      } catch (err) {
        if (!isPythonMissingError(err)) throw err;
        console.warn(
          "[export-quotation-pdf] Python unavailable, falling back to Node Chromium",
          err instanceof Error ? err.message : err
        );
        pdf = await renderWithNode(parsed);
      }
    }

    const name = safeFilename(
      parsed.metadata.quotation_number ||
        parsed.metadata.project_name ||
        parsed.metadata.quotation_date
    );

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quotation-${name}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "PDF rendering failed. Is Chromium / Python Playwright installed?";
    console.error("[export-quotation-pdf]", err);
    return NextResponse.json(
      {
        error: message,
        hint:
          "Local: install Google Chrome (or Python Playwright). On Vercel, Chromium is downloaded from the Sparticuz pack URL on first export.",
      },
      { status: 503 }
    );
  }
}
