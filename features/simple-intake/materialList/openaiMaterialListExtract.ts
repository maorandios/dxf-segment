/**
 * OpenAI Mini extraction for Stage 1 material list (snapshot only).
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { buildSimpleAnalyzeUserText } from "../buildAnalyzeRequest";
import { SIMPLE_INTAKE_TIMEOUT_MS } from "../types";
import {
  adaptMaterialListRows,
  buildMaterialListStageDebug,
} from "./adaptMaterialListRows";
import {
  aiMaterialListResultSchema,
  getSimpleIntakeOpenAiModel,
  MATERIAL_LIST_SYSTEM_PROMPT,
} from "./schema";
import type { MaterialListRow } from "./types";

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

export type MaterialListExtractionResult = {
  rows: MaterialListRow[];
  providerCallCount: 1;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  materialListStageDebug: Record<string, unknown>;
  extractionProviderDebug: Record<string, unknown>;
  durationMs: number;
  validationMs: number;
};

export async function runOpenAiMaterialListExtraction(args: {
  snapshot: SnapshotBody;
}): Promise<MaterialListExtractionResult> {
  const started = Date.now();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = getSimpleIntakeOpenAiModel();
  if (!apiKey) {
    throw Object.assign(new Error("MISSING_API_KEY"), {
      code: "MISSING_API_KEY",
    });
  }
  const client = new OpenAI({ apiKey });
  const userText = buildSimpleAnalyzeUserText(args.snapshot);

  const response = await withTimeout(
    client.responses.parse({
      model,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: MATERIAL_LIST_SYSTEM_PROMPT },
        { role: "user", content: userText },
      ],
      text: {
        format: zodTextFormat(
          aiMaterialListResultSchema,
          "omega_material_list_v1"
        ),
      },
    }),
    SIMPLE_INTAKE_TIMEOUT_MS
  );

  const parsed = response.output_parsed;
  if (!parsed) {
    throw Object.assign(new Error("Empty structured output"), {
      code: "EMPTY_STRUCTURED_OUTPUT",
    });
  }

  const tVal = Date.now();
  const validated = aiMaterialListResultSchema.parse(parsed);
  const adapted = adaptMaterialListRows(validated);
  const validationMs = Date.now() - tVal;

  if (adapted.rows.length === 0) {
    throw Object.assign(new Error("EMPTY_MATERIAL_LIST"), {
      code: "EMPTY_MATERIAL_LIST",
      diagnostics: adapted.diagnostics,
    });
  }

  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;
  const totalTokens =
    inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : (response.usage?.total_tokens ?? null);

  const materialListStageDebug = {
    ...buildMaterialListStageDebug({
      model,
      rows: adapted.rows,
      diagnostics: adapted.diagnostics,
    }),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
    adaptDiagnostics: adapted.diagnostics,
  };

  return {
    rows: adapted.rows,
    providerCallCount: 1,
    model,
    usage: { inputTokens, outputTokens, totalTokens },
    materialListStageDebug,
    extractionProviderDebug: {
      provider: "openai",
      apiVersion: "responses",
      model,
      schemaVersion: "material-list-v1",
      providerCall: {
        provider: "openai",
        count: 1,
        purpose: "MATERIAL_LIST_EXTRACTION",
      },
    },
    durationMs: Date.now() - started,
    validationMs,
  };
}
