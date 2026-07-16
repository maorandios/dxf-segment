import { NextResponse } from "next/server";
import {
  buildDocumentDxfAudit,
  sanitizeAcceptedFacts,
} from "@/lib/ai-intake/documentDxfAudit";
import {
  extractIsolatedSourcesWithOpenAI,
  mimeForFilename,
} from "@/lib/ai-intake/openaiExtract";
import {
  slimRegistryItemSchema,
  type AiIntakeAnalyzeResponse,
  type SlimRegistryItem,
} from "@/lib/ai-intake/schemas";
import { validateSourceCompleteness } from "@/lib/ai-intake/validateDocumentExtraction";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_XLSX = 5;
const MAX_PDF = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_BODY_CHARS = 50_000;

function heError(code: string): string {
  const map: Record<string, string> = {
    MISSING_API_KEY: "מפתח OpenAI חסר בשרת.",
    MISSING_MODEL_ENV: "חסר משתנה סביבה OPENAI_EXTRACTION_MODEL.",
    NO_REGISTRY: "רישום DXF ריק או לא תקין.",
    LIMIT_EXCEEDED: "חריגה ממגבלות גודל או כמות קבצים.",
    UNSUPPORTED_FILE: "סוג קובץ לא נתמך לניתוח.",
    OPENAI_FAILED: "קריאת OpenAI נכשלה. נסו שוב מאוחר יותר.",
    OPENAI_SCHEMA: "פלט OpenAI לא תואם את הסכמה הנדרשת.",
    EMPTY_EXTRACTION: "לא התקבלו עובדות מהניתוח.",
    BAD_REQUEST: "בקשה לא תקינה.",
    SOURCE_COMPLETENESS: "תוצאת חילוץ חסרה עבור אחד המקורות.",
  };
  return map[code] ?? "אירעה שגיאה בעיבוד הבקשה.";
}

function fail(code: string, status = 400): NextResponse {
  const body: AiIntakeAnalyzeResponse = {
    ok: false,
    code,
    messageHe: heError(code),
  };
  return NextResponse.json(body, { status });
}

function isXlsxName(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls");
}

function isPdfName(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const sender = String(form.get("sender") ?? "");
    const subject = String(form.get("subject") ?? "");
    const body = String(form.get("body") ?? "");
    const registryRaw = String(form.get("registryJson") ?? "");

    if (body.length > MAX_BODY_CHARS) {
      return fail("LIMIT_EXCEEDED");
    }

    let registry: SlimRegistryItem[];
    try {
      const parsed = JSON.parse(registryRaw);
      registry = z.array(slimRegistryItemSchema).min(1).parse(parsed);
    } catch {
      return fail("NO_REGISTRY");
    }

    const documents: Array<{
      documentId: string;
      sourceType: "XLSX" | "PDF";
      filename: string;
      mimeType: string;
      buffer: Buffer;
    }> = [];

    let totalBytes = 0;
    let xlsxCount = 0;
    let pdfCount = 0;

    for (const [key, value] of form.entries()) {
      if (key !== "documents" && key !== "xlsxFiles" && key !== "pdfFiles") {
        continue;
      }
      if (typeof value === "string") continue;
      const file = value as File;
      const name = file.name || "file";

      if (!isXlsxName(name) && !isPdfName(name)) {
        return fail("UNSUPPORTED_FILE");
      }
      if (isXlsxName(name)) {
        xlsxCount += 1;
        if (xlsxCount > MAX_XLSX) return fail("LIMIT_EXCEEDED");
      }
      if (isPdfName(name)) {
        pdfCount += 1;
        if (pdfCount > MAX_PDF) return fail("LIMIT_EXCEEDED");
      }

      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.byteLength > MAX_FILE_BYTES) return fail("LIMIT_EXCEEDED");
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) return fail("LIMIT_EXCEEDED");

      const sourceType = isPdfName(name) ? ("PDF" as const) : ("XLSX" as const);
      const index = sourceType === "PDF" ? pdfCount : xlsxCount;
      documents.push({
        documentId: `doc:${sourceType.toLowerCase()}:${index}`,
        sourceType,
        filename: name,
        mimeType: file.type || mimeForFilename(name),
        buffer: buf,
      });
    }

    const result = await extractIsolatedSourcesWithOpenAI({
      sender,
      subject,
      body,
      registry,
      documents,
      concurrency: 3,
    });

    const completenessWarnings = validateSourceCompleteness({
      uploaded: documents.map((d) => ({
        documentId: d.documentId,
        fileName: d.filename,
        sourceType: d.sourceType,
      })),
      documents: result.aggregated.documents,
    });

    const sanitized = sanitizeAcceptedFacts(
      result.aggregated.expandedFacts,
      registry
    );

    if (
      result.extraction.documentRows.length === 0 &&
      result.extraction.emailFacts.length === 0 &&
      result.extraction.unresolvedItems.length === 0 &&
      documents.length === 0 &&
      !body.trim()
    ) {
      return fail("EMPTY_EXTRACTION", 422);
    }

    // Total failure: every document failed and no email facts
    const allDocsFailed =
      documents.length > 0 &&
      result.aggregated.documents.every((d) => d.status === "FAILED");
    if (
      allDocsFailed &&
      result.extraction.emailFacts.length === 0 &&
      !body.trim()
    ) {
      return fail("OPENAI_FAILED", 502);
    }

    const audit = buildDocumentDxfAudit({
      documentRows: result.extraction.documentRows,
      documentResults: result.aggregated.documents,
      acceptedFacts: sanitized.acceptedFacts,
      unresolvedItems: result.extraction.unresolvedItems,
      registry,
    });

    const warnings = [
      ...result.extraction.warnings,
      ...completenessWarnings,
      ...sanitized.warnings,
      ...(result.partial ? ["PARTIAL_SOURCE_EXTRACTION"] : []),
    ];

    const response: AiIntakeAnalyzeResponse = {
      ok: true,
      extraction: {
        ...result.extraction,
        warnings,
      },
      acceptedFacts: sanitized.acceptedFacts,
      aggregated: {
        ...result.aggregated,
        expandedFacts: sanitized.acceptedFacts,
      },
      auditRows: audit.rows,
      auditSummary: audit.summary,
      warnings,
      partial: result.partial,
      debug: {
        model: result.model,
        durationMs: result.durationMs,
        openaiCallCount: result.openaiCallCount,
        usage: result.usage,
        perSourceUsage: result.perSourceUsage,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "OPENAI_FAILED";

    if (code === "MISSING_API_KEY" || code === "MISSING_MODEL_ENV") {
      return fail(code, 500);
    }
    if (code === "OPENAI_SCHEMA") {
      return fail("OPENAI_SCHEMA", 502);
    }
    if (code === "SOURCE_COMPLETENESS" || code === "SOURCE_METADATA_MISMATCH") {
      return fail("SOURCE_COMPLETENESS", 502);
    }

    console.error("[ai-intake/analyze]", err);
    return fail("OPENAI_FAILED", 502);
  }
}
