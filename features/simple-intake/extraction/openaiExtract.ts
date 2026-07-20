/**
 * Existing OpenAI Simple Intake workbook extraction (snapshot JSON).
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  SIMPLE_INTAKE_SYSTEM_PROMPT,
  simpleAiWorkbookResultSchema,
} from "../aiSchema";
import { buildSimpleAnalyzeUserText } from "../buildAnalyzeRequest";
import { SIMPLE_INTAKE_TIMEOUT_MS } from "../types";
import type { ExtractionProviderResult } from "./types";

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

export async function runOpenAiWorkbookExtraction(args: {
  snapshot: SnapshotBody;
}): Promise<ExtractionProviderResult> {
  const started = Date.now();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = "gpt-5.4-mini-2026-03-17";
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
    throw Object.assign(new Error("Empty structured output"), {
      code: "EMPTY_STRUCTURED_OUTPUT",
    });
  }
  const result = simpleAiWorkbookResultSchema.parse(parsed);

  return {
    result,
    providerCallCount: 1,
    model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    },
    extractionProviderDebug: {
      provider: "openai",
      apiVersion: "responses",
      model,
      providerCall: {
        provider: "openai",
        uploadCount: 0,
        extractionJobCount: 0,
        openAiCallCount: 1,
      },
    },
    durationMs: Date.now() - started,
  };
}
