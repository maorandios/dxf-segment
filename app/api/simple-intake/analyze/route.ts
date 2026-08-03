import { NextResponse } from "next/server";
import {
  getSimpleWorkbookExtractionProvider,
  LlamaExtractError,
  runLlamaExtractWorkbook,
} from "@/features/simple-intake/extraction";
import { simpleAiWorkbookResultSchema } from "@/features/simple-intake/aiSchema";
import { runOpenAiMaterialListExtraction } from "@/features/simple-intake/materialList/openaiMaterialListExtract";
import { runOpenAiPdfMaterialListExtraction } from "@/features/simple-intake/materialList/openaiPdfMaterialListExtract";
import {
  detectMaterialSourceTypeFromName,
  validateMaterialSourceBytes,
  MATERIAL_SOURCE_UNSUPPORTED_HE,
} from "@/features/simple-intake/materialList/materialSourceTypes";

export const runtime = "nodejs";
/** LlamaExtract polling may take up to ~240s; OpenAI material list is shorter. */
export const maxDuration = 300;

type SnapshotBody = {
  workbookId: string;
  filename: string;
  sheets: Array<{
    sheetName: string;
    maxSourceRow?: number;
    populatedRowCount?: number;
    lastPopulatedSourceRow?: number | null;
    rows: Array<{
      rowNumber: number;
      cells: Array<{ address: string; text: string }>;
    }>;
  }>;
};

const HEBREW_FAIL_EXCEL =
  "לא הצלחנו לקרוא את קובץ האקסל. נסה שוב או העלה קובץ אחר.";
const HEBREW_FAIL_PDF =
  "הקובץ נקלט, אך לא ניתן היה לפענח ממנו רשימת חומר בצורה אמינה.";

async function readRequest(req: Request): Promise<{
  snapshot: SnapshotBody | null;
  sourceBytes: Buffer | null;
  sourceFilename: string | null;
  sourceMimeType: string | null;
  sourceTypeHint: string | null;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const snapshotRaw = form.get("snapshot");
    let snapshot: SnapshotBody | null = null;
    if (typeof snapshotRaw === "string" && snapshotRaw.trim()) {
      snapshot = JSON.parse(snapshotRaw) as SnapshotBody;
    }
    const sourceTypeHint =
      typeof form.get("sourceType") === "string"
        ? String(form.get("sourceType"))
        : null;

    const file =
      form.get("source") ??
      form.get("workbook") ??
      form.get("pdf");
    let sourceBytes: Buffer | null = null;
    let sourceFilename: string | null = null;
    let sourceMimeType: string | null = null;
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      sourceFilename = f.name || snapshot?.filename || "source";
      sourceMimeType = f.type || null;
      sourceBytes = Buffer.from(await f.arrayBuffer());
    }
    return {
      snapshot,
      sourceBytes,
      sourceFilename,
      sourceMimeType,
      sourceTypeHint,
    };
  }

  const body = (await req.json()) as {
    snapshot?: SnapshotBody;
    sourceType?: string;
  };
  return {
    snapshot: body.snapshot ?? null,
    sourceBytes: null,
    sourceFilename: body.snapshot?.filename ?? null,
    sourceMimeType: null,
    sourceTypeHint: body.sourceType ?? null,
  };
}

function sanitizeDebug(debug: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(debug, (_k, v) => {
    if (typeof v === "string" && /sk-|llama.*key|api[_-]?key/i.test(v)) {
      return "[redacted]";
    }
    return v;
  });
  return JSON.parse(json) as Record<string, unknown>;
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  const provider = getSimpleWorkbookExtractionProvider();

  try {
    const {
      snapshot,
      sourceBytes,
      sourceFilename,
      sourceMimeType,
      sourceTypeHint,
    } = await readRequest(req);

    const fileName = sourceFilename || snapshot?.filename || "";
    const detected =
      sourceTypeHint === "PDF" || sourceTypeHint === "EXCEL"
        ? (sourceTypeHint as "PDF" | "EXCEL")
        : detectMaterialSourceTypeFromName(fileName);

    if (detected === "PDF") {
      if (!sourceBytes) {
        return NextResponse.json(
          {
            ok: false,
            stage: "AI_REQUEST",
            code: "MISSING_PDF_FILE",
            message: HEBREW_FAIL_PDF,
            retryable: false,
            durationMs: Date.now() - started,
          },
          { status: 400 }
        );
      }
      const validated = validateMaterialSourceBytes({
        fileName,
        mimeType: sourceMimeType,
        bytes: sourceBytes,
      });
      if (!validated.ok) {
        return NextResponse.json(
          {
            ok: false,
            stage: "AI_REQUEST",
            code: validated.code,
            message: validated.message,
            retryable: false,
            durationMs: Date.now() - started,
          },
          { status: 400 }
        );
      }

      const out = await runOpenAiPdfMaterialListExtraction({
        pdfBytes: sourceBytes,
        fileName: validated.fileName,
        mimeType: validated.mimeType,
      });

      return NextResponse.json({
        ok: true,
        materialListRows: out.rows,
        materialListStage: sanitizeDebug(out.materialListStageDebug),
        qualityGatePassed: out.qualityGatePassed,
        qualityGate: out.qualityGate,
        targetedRepair: out.targetedRepair,
        providerCallCount: out.providerCallCount,
        model: out.model,
        durationMs: Date.now() - started,
        usage: out.usage,
        costs: {
          primaryEstimatedCostUsd: out.primaryEstimatedCostUsd,
          repairEstimatedCostUsd: out.repairEstimatedCostUsd,
          totalEstimatedCostUsd: out.totalEstimatedCostUsd,
        },
        sourceDocument: out.sourceDocument,
        pdfExtraction: out.pdfExtractionDebug,
        extractionProvider: "openai",
        extractionProviderDebug: sanitizeDebug(out.extractionProviderDebug),
        result: {
          status: "SUCCESS",
          summary: `material-list-v1-pdf:${out.rows.length}`,
          rows: [],
          warnings: [],
        },
      });
    }

    if (!snapshot || !Array.isArray(snapshot.sheets)) {
      return NextResponse.json(
        {
          ok: false,
          stage: "AI_REQUEST",
          message: "Missing workbook snapshot",
          retryable: false,
        },
        { status: 400 }
      );
    }

    const probe = JSON.stringify(snapshot);
    if (/"entities"|"dxfBytes"|"dxfContent"/i.test(probe)) {
      return NextResponse.json(
        {
          ok: false,
          stage: "AI_REQUEST",
          message: "DXF payload is not allowed",
          retryable: false,
        },
        { status: 400 }
      );
    }

    if (sourceBytes && fileName) {
      const validated = validateMaterialSourceBytes({
        fileName,
        mimeType: sourceMimeType,
        bytes: sourceBytes,
      });
      if (!validated.ok && validated.code === "TOO_LARGE") {
        return NextResponse.json(
          {
            ok: false,
            stage: "AI_REQUEST",
            code: validated.code,
            message: validated.message,
            retryable: false,
            durationMs: Date.now() - started,
          },
          { status: 400 }
        );
      }
      if (!validated.ok && validated.code === "UNSUPPORTED_TYPE") {
        return NextResponse.json(
          {
            ok: false,
            stage: "AI_REQUEST",
            code: validated.code,
            message: MATERIAL_SOURCE_UNSUPPORTED_HE,
            retryable: false,
            durationMs: Date.now() - started,
          },
          { status: 400 }
        );
      }
    }

    if (provider === "llama-extract") {
      if (!sourceBytes || sourceBytes.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            stage: "AI_REQUEST",
            message: HEBREW_FAIL_EXCEL,
            code: "MISSING_WORKBOOK_FILE",
            retryable: false,
            extractionProvider: "llama-extract",
            durationMs: Date.now() - started,
          },
          { status: 400 }
        );
      }

      const out = await runLlamaExtractWorkbook({
        workbookBytes: sourceBytes,
        filename: sourceFilename || snapshot.filename || "workbook.xlsx",
      });

      const normalizedRows = out.result.rows.map((r) => ({
        ...r,
        thicknessMm:
          typeof r.thicknessMm === "number" && r.thicknessMm > 0
            ? r.thicknessMm
            : null,
        widthMm:
          typeof r.widthMm === "number" && r.widthMm > 0 ? r.widthMm : null,
        lengthMm:
          typeof r.lengthMm === "number" && r.lengthMm > 0 ? r.lengthMm : null,
      }));
      const parsed = simpleAiWorkbookResultSchema.safeParse({
        ...out.result,
        rows: normalizedRows,
      });
      if (!parsed.success) {
        return NextResponse.json(
          {
            ok: false,
            stage: "AI_REQUEST",
            code: "LLAMA_RESULT_SCHEMA_INVALID",
            message: HEBREW_FAIL_EXCEL,
            retryable: false,
            durationMs: Date.now() - started,
            extractionProvider: "llama-extract",
            extractionProviderDebug: sanitizeDebug({
              ...out.extractionProviderDebug,
              schemaIssues: parsed.error.issues.slice(0, 20),
            }),
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        result: parsed.data,
        providerCallCount: out.providerCallCount,
        model: out.model,
        durationMs: Date.now() - started,
        usage: out.usage,
        extractionProvider: "llama-extract",
        extractionProviderDebug: sanitizeDebug(out.extractionProviderDebug),
      });
    }

    // Default: OpenAI Mini material-list v1 (snapshot only; optional one repair).
    const out = await runOpenAiMaterialListExtraction({ snapshot });
    return NextResponse.json({
      ok: true,
      materialListRows: out.rows,
      materialListStage: sanitizeDebug(out.materialListStageDebug),
      qualityGatePassed: out.qualityGatePassed,
      qualityGate: out.qualityGate,
      targetedRepair: out.targetedRepair,
      providerCallCount: out.providerCallCount,
      model: out.model,
      durationMs: Date.now() - started,
      usage: out.usage,
      costs: {
        primaryEstimatedCostUsd: out.primaryEstimatedCostUsd,
        repairEstimatedCostUsd: out.repairEstimatedCostUsd,
        totalEstimatedCostUsd: out.totalEstimatedCostUsd,
      },
      sourceDocument: {
        sourceType: "EXCEL",
        fileName: snapshot.filename,
        mimeType: sourceMimeType,
        fileSizeBytes: sourceBytes?.length ?? null,
        excelSheetCount: snapshot.sheets.length,
        pdfPageCount: null,
        pdfDetail: null,
      },
      extractionProvider: "openai",
      extractionProviderDebug: sanitizeDebug(out.extractionProviderDebug),
      result: {
        status: "SUCCESS",
        summary: `material-list-v1:${out.rows.length}`,
        rows: [],
        warnings: [],
      },
    });
  } catch (err) {
    if (err instanceof LlamaExtractError) {
      return NextResponse.json(
        {
          ok: false,
          stage: "AI_RESPONSE",
          code: err.code,
          message: HEBREW_FAIL_EXCEL,
          retryable:
            err.code === "LLAMA_POLL_TIMEOUT" ||
            err.code === "MISSING_LLAMA_API_KEY",
          durationMs: Date.now() - started,
          extractionProvider: "llama-extract",
          extractionProviderDebug: sanitizeDebug(err.debug),
        },
        {
          status:
            err.code === "LLAMA_POLL_TIMEOUT"
              ? 504
              : err.code === "MISSING_LLAMA_API_KEY"
                ? 500
                : 502,
        }
      );
    }

    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "AI_REQUEST_FAILED";
    const messageHe =
      err && typeof err === "object" && "messageHe" in err
        ? String((err as { messageHe?: string }).messageHe)
        : null;
    const explicitRetryable =
      err && typeof err === "object" && "retryable" in err
        ? Boolean((err as { retryable?: boolean }).retryable)
        : null;
    const nonRetryableCodes = new Set([
      "MISSING_API_KEY",
      "MISSING_MODEL_ENV",
      "EMPTY_STRUCTURED_OUTPUT",
      "EMPTY_REPAIR_OUTPUT",
      "EMPTY_MATERIAL_LIST",
      "INVALID_STRICT_SCHEMA",
      "SCHEMA_VALIDATION_FAILED",
      "REPAIR_PAYLOAD_CONTAINS_DXF",
      "UNSUPPORTED_TYPE",
      "INVALID_PDF",
      "TOO_LARGE",
      "EMPTY_FILE",
      "MIME_MISMATCH",
    ]);
    const retryable =
      explicitRetryable != null
        ? explicitRetryable
        : code === "PROVIDER_TIMEOUT"
          ? true
          : !nonRetryableCodes.has(code);
    const isPdfFail =
      code === "INVALID_PDF" ||
      code === "EMPTY_MATERIAL_LIST" ||
      code === "EMPTY_STRUCTURED_OUTPUT";
    const message =
      code === "PROVIDER_TIMEOUT"
        ? "תם הזמן המוקצב לבקשת ה-AI"
        : code === "MISSING_API_KEY"
          ? "חסר מפתח OpenAI בשרת. הוסיפו OPENAI_API_KEY בהגדרות הסביבה (Vercel או .env.local) והפעילו מחדש."
        : code === "MISSING_MODEL_ENV"
          ? "חסר שם מודל לניתוח. בדקו את SIMPLE_INTAKE_OPENAI_MODEL."
          : messageHe
            ? messageHe
            : code === "EMPTY_MATERIAL_LIST"
              ? isPdfFail
                ? HEBREW_FAIL_PDF
                : HEBREW_FAIL_EXCEL
              : err instanceof Error &&
                  !/openai|api key|stack|file_/i.test(err.message)
                ? err.message
                : HEBREW_FAIL_EXCEL;

    return NextResponse.json(
      {
        ok: false,
        stage: "AI_REQUEST",
        code,
        message,
        retryable,
        durationMs: Date.now() - started,
        extractionProvider: "openai",
      },
      {
        status:
          code === "PROVIDER_TIMEOUT"
            ? 504
            : code === "MISSING_API_KEY"
              ? 500
              : code === "UNSUPPORTED_TYPE" ||
                  code === "INVALID_PDF" ||
                  code === "TOO_LARGE"
                ? 400
                : 502,
      }
    );
  }
}
