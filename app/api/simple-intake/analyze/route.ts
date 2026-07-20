import { NextResponse } from "next/server";
import {
  getSimpleWorkbookExtractionProvider,
  LlamaExtractError,
  runLlamaExtractWorkbook,
} from "@/features/simple-intake/extraction";
import { simpleAiWorkbookResultSchema } from "@/features/simple-intake/aiSchema";
import { runOpenAiMaterialListExtraction } from "@/features/simple-intake/materialList/openaiMaterialListExtract";

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

const HEBREW_FAIL =
  "לא הצלחנו לקרוא את קובץ האקסל. נסה שוב או העלה קובץ אחר.";

async function readRequest(req: Request): Promise<{
  snapshot: SnapshotBody | null;
  workbookBytes: Buffer | null;
  workbookFilename: string | null;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const snapshotRaw = form.get("snapshot");
    let snapshot: SnapshotBody | null = null;
    if (typeof snapshotRaw === "string") {
      snapshot = JSON.parse(snapshotRaw) as SnapshotBody;
    }
    const file = form.get("workbook");
    let workbookBytes: Buffer | null = null;
    let workbookFilename: string | null = null;
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      workbookFilename = f.name || snapshot?.filename || "workbook.xlsx";
      workbookBytes = Buffer.from(await f.arrayBuffer());
    }
    return { snapshot, workbookBytes, workbookFilename };
  }

  const body = (await req.json()) as {
    snapshot?: SnapshotBody;
  };
  return {
    snapshot: body.snapshot ?? null,
    workbookBytes: null,
    workbookFilename: body.snapshot?.filename ?? null,
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
  // Active path for this checkpoint is OpenAI material-list v1.
  // LlamaExtract remains available only when explicitly selected (POC).
  const provider = getSimpleWorkbookExtractionProvider();

  try {
    const { snapshot, workbookBytes, workbookFilename } = await readRequest(req);

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

    if (provider === "llama-extract") {
      // POC path only — not the default Excel→Approved Material List workflow.
      if (!workbookBytes || workbookBytes.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            stage: "AI_REQUEST",
            message: HEBREW_FAIL,
            code: "MISSING_WORKBOOK_FILE",
            retryable: false,
            extractionProvider: "llama-extract",
            durationMs: Date.now() - started,
          },
          { status: 400 }
        );
      }

      const out = await runLlamaExtractWorkbook({
        workbookBytes,
        filename: workbookFilename || snapshot.filename || "workbook.xlsx",
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
            message: HEBREW_FAIL,
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

    // Default: OpenAI Mini material-list v1 (snapshot only, one call).
    const out = await runOpenAiMaterialListExtraction({ snapshot });
    return NextResponse.json({
      ok: true,
      materialListRows: out.rows,
      materialListStage: sanitizeDebug(out.materialListStageDebug),
      providerCallCount: out.providerCallCount,
      model: out.model,
      durationMs: Date.now() - started,
      usage: out.usage,
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
          message: HEBREW_FAIL,
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
    const retryable =
      code === "PROVIDER_TIMEOUT"
        ? true
        : code !== "MISSING_API_KEY" && code !== "MISSING_MODEL_ENV";
    const message =
      code === "PROVIDER_TIMEOUT"
        ? "תם הזמן המוקצב לבקשת ה-AI"
        : code === "MISSING_API_KEY" || code === "MISSING_MODEL_ENV"
          ? "חסר מפתח או מודל לניתוח"
          : code === "EMPTY_MATERIAL_LIST"
            ? HEBREW_FAIL
            : err instanceof Error
              ? err.message
              : HEBREW_FAIL;

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
              : 502,
      }
    );
  }
}
