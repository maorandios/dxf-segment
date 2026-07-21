/**
 * Targeted OpenAI repair call — at most once per workbook analysis.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { SIMPLE_INTAKE_TIMEOUT_MS } from "../types";
import {
  buildRepairSourcePayloads,
  type SnapshotLike,
} from "./buildRepairContext";
import {
  buildTargetedRepairUserPrompt,
  targetedMaterialRepairResultSchema,
  TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT,
} from "./repairSchema";
import { getSimpleIntakeOpenAiModel } from "./schema";
import type { MaterialListRow, RepairableMaterialField } from "./types";

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

/** Approximate list prices ($ / 1M tokens) for reporting only. */
export function estimateOpenAiCostUsd(
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (inputTokens == null || outputTokens == null) return null;
  const EST_INPUT_PER_M = 0.25;
  const EST_OUTPUT_PER_M = 2.0;
  return (
    (inputTokens / 1_000_000) * EST_INPUT_PER_M +
    (outputTokens / 1_000_000) * EST_OUTPUT_PER_M
  );
}

export type TargetedRepairCallResult = {
  repair: ReturnType<typeof targetedMaterialRepairResultSchema.parse>;
  model: string;
  durationMs: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  estimatedCostUsd: number | null;
  repairedSourceRowCount: number;
  sourceContexts: ReturnType<typeof buildRepairSourcePayloads>;
  /** Payload sent to the model — for tests (no DXF). */
  requestPayload: {
    repairFields: RepairableMaterialField[];
    sourceRowCount: number;
    includesDxf: false;
  };
};

export async function runTargetedMaterialRepair(args: {
  snapshot: SnapshotLike;
  rows: MaterialListRow[];
  repairFields: RepairableMaterialField[];
}): Promise<TargetedRepairCallResult> {
  const started = Date.now();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = getSimpleIntakeOpenAiModel();
  if (!apiKey) {
    throw Object.assign(new Error("MISSING_API_KEY"), {
      code: "MISSING_API_KEY",
      retryable: false,
    });
  }

  const payloads = buildRepairSourcePayloads({
    snapshot: args.snapshot,
    rows: args.rows,
    repairFields: args.repairFields,
  });

  if (payloads.length === 0) {
    return {
      repair: { rows: [] },
      model,
      durationMs: Date.now() - started,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      estimatedCostUsd: null,
      repairedSourceRowCount: 0,
      sourceContexts: [],
      requestPayload: {
        repairFields: args.repairFields,
        sourceRowCount: 0,
        includesDxf: false,
      },
    };
  }

  const client = new OpenAI({ apiKey });
  const userText = buildTargetedRepairUserPrompt({
    repairFields: args.repairFields,
    rows: payloads,
  });

  // Guard: repair payload must never include DXF binary/entity payloads.
  if (/"entities"|"dxfBytes"|"dxfContent"/i.test(userText)) {
    throw Object.assign(new Error("REPAIR_PAYLOAD_CONTAINS_DXF"), {
      code: "REPAIR_PAYLOAD_CONTAINS_DXF",
      retryable: false,
    });
  }

  let textFormat: ReturnType<typeof zodTextFormat>;
  try {
    textFormat = zodTextFormat(
      targetedMaterialRepairResultSchema,
      "omega_material_list_targeted_repair_v1"
    );
  } catch (err) {
    throw Object.assign(
      new Error(
        err instanceof Error
          ? err.message
          : "Invalid strict Structured Output schema"
      ),
      {
        code: "INVALID_STRICT_SCHEMA",
        retryable: false,
      }
    );
  }

  let response: Awaited<ReturnType<typeof client.responses.parse>>;
  try {
    response = await withTimeout(
      client.responses.parse({
        model,
        reasoning: { effort: "none" },
        input: [
          { role: "system", content: TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        text: {
          format: textFormat,
        },
      }),
      SIMPLE_INTAKE_TIMEOUT_MS
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (
      lower.includes("optional") ||
      (lower.includes("required") && lower.includes("schema")) ||
      (lower.includes("strict") && lower.includes("schema")) ||
      lower.includes("invalid schema") ||
      lower.includes("unsupported")
    ) {
      throw Object.assign(new Error(msg), {
        code: "INVALID_STRICT_SCHEMA",
        retryable: false,
      });
    }
    throw err;
  }

  const parsed = response.output_parsed;
  if (!parsed) {
    throw Object.assign(new Error("Empty repair structured output"), {
      code: "EMPTY_REPAIR_OUTPUT",
      retryable: false,
    });
  }

  let repair: ReturnType<typeof targetedMaterialRepairResultSchema.parse>;
  try {
    repair = targetedMaterialRepairResultSchema.parse(parsed);
  } catch (err) {
    throw Object.assign(
      new Error(
        err instanceof Error ? err.message : "Repair schema validation failed"
      ),
      {
        code: "SCHEMA_VALIDATION_FAILED",
        retryable: false,
      }
    );
  }
  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;
  const totalTokens =
    inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : (response.usage?.total_tokens ?? null);

  return {
    repair,
    model,
    durationMs: Date.now() - started,
    usage: { inputTokens, outputTokens, totalTokens },
    estimatedCostUsd: estimateOpenAiCostUsd(inputTokens, outputTokens),
    repairedSourceRowCount: payloads.length,
    sourceContexts: payloads,
    requestPayload: {
      repairFields: args.repairFields,
      sourceRowCount: payloads.length,
      includesDxf: false,
    },
  };
}
