import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  SIMPLE_INTAKE_SYSTEM_PROMPT,
  simpleAiWorkbookResultSchema,
} from "@/features/simple-intake/aiSchema";
import { buildSimpleAnalyzeUserText } from "@/features/simple-intake/buildAnalyzeRequest";
import { SIMPLE_INTAKE_TIMEOUT_MS } from "@/features/simple-intake/types";

export const runtime = "nodejs";
export const maxDuration = 120;

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

function getClientAndModel(): { client: OpenAI; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_EXTRACTION_MODEL?.trim();
  if (!apiKey) {
    throw Object.assign(new Error("MISSING_API_KEY"), { code: "MISSING_API_KEY" });
  }
  if (!model) {
    throw Object.assign(new Error("MISSING_MODEL_ENV"), {
      code: "MISSING_MODEL_ENV",
    });
  }
  return { client: new OpenAI({ apiKey }), model };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error("PROVIDER_TIMEOUT"), {
              code: "PROVIDER_TIMEOUT",
            })
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  try {
    const body = (await req.json()) as {
      snapshot?: SnapshotBody;
      /** @deprecated Ignored — DXF hints must not influence extraction. */
      knownExactIdentifiersFoundInWorkbook?: unknown;
    };
    const snapshot = body.snapshot;
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

    const raw = JSON.stringify(body);
    if (/"entities"|"dxfBytes"|"dxfContent"/i.test(raw)) {
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

    const { client, model } = getClientAndModel();
    // Workbook snapshot only — legacy DXF hints are never forwarded
    const userText = buildSimpleAnalyzeUserText(snapshot);

    const response = await withTimeout(
      client.responses.parse({
        model,
        reasoning: { effort: "none" },
        input: [
          { role: "system", content: SIMPLE_INTAKE_SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        text: {
          format: zodTextFormat(
            simpleAiWorkbookResultSchema,
            "omega_simple_intake_extraction"
          ),
        },
      }),
      SIMPLE_INTAKE_TIMEOUT_MS
    );

    const parsed = response.output_parsed;
    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          stage: "AI_RESPONSE",
          message: "Empty structured output",
          retryable: true,
          durationMs: Date.now() - started,
        },
        { status: 502 }
      );
    }

    const result = simpleAiWorkbookResultSchema.parse(parsed);
    return NextResponse.json({
      ok: true,
      result,
      providerCallCount: 1,
      model,
      durationMs: Date.now() - started,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "AI_REQUEST_FAILED";
    const retryable =
      code === "PROVIDER_TIMEOUT" ||
      code === "MISSING_API_KEY" ||
      code === "MISSING_MODEL_ENV"
        ? code !== "MISSING_API_KEY" && code !== "MISSING_MODEL_ENV"
        : true;
    const message =
      code === "PROVIDER_TIMEOUT"
        ? "תם הזמן המוקצב לבקשת ה-AI"
        : code === "MISSING_API_KEY" || code === "MISSING_MODEL_ENV"
          ? "חסרה הגדרת מפתח/מודל לשרת"
          : err instanceof Error
            ? err.message
            : String(err);

    return NextResponse.json(
      {
        ok: false,
        stage: code === "PROVIDER_TIMEOUT" ? "AI_RESPONSE" : "AI_REQUEST",
        code,
        message,
        retryable: code === "PROVIDER_TIMEOUT" ? true : retryable,
        durationMs: Date.now() - started,
      },
      { status: code === "PROVIDER_TIMEOUT" ? 504 : 500 }
    );
  }
}
