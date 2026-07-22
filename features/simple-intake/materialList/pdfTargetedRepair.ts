/**
 * PDF targeted repair call — reuses uploaded OpenAI file_id.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { SIMPLE_INTAKE_TIMEOUT_MS } from "../types";
import { missingRepairableFields } from "./decideRepairPlan";
import { isFieldUsable } from "./qualityGate";
import { getSimpleIntakePdfDetail } from "./pdfConfig";
import {
  buildPdfTargetedRepairUserPrompt,
  pdfTargetedRepairResultSchema,
  PDF_TARGETED_REPAIR_SYSTEM_PROMPT,
  type PdfRepairTarget,
} from "./pdfRepairSchema";
import { getSimpleIntakeOpenAiModel } from "./schema";
import { estimateOpenAiCostUsd } from "./targetedRepair";
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

export function selectPdfRowsForRepair(
  rows: MaterialListRow[],
  repairFields: RepairableMaterialField[]
): MaterialListRow[] {
  return rows.filter((row) => {
    if (row.sourceType !== "PDF") return false;
    if (row.sourcePage == null || row.sourcePage <= 0) return false;
    return repairFields.some((f) => {
      if (isFieldUsable(f, row)) return false;
      if (row.fieldResolutions?.[f] === "MISSING_IN_SOURCE") return false;
      return true;
    });
  });
}

export function buildPdfRepairTargets(
  rows: MaterialListRow[],
  repairFields: RepairableMaterialField[]
): PdfRepairTarget[] {
  return selectPdfRowsForRepair(rows, repairFields).map((row) => ({
    repairTargetId: row.rowId,
    sourcePage: row.sourcePage ?? null,
    sourceAnchorText: row.sourceAnchorText ?? null,
    requestedFields: missingRepairableFields(row).filter((f) =>
      repairFields.includes(f)
    ),
  }));
}

export async function runPdfTargetedMaterialRepair(args: {
  client: OpenAI;
  fileId: string;
  rows: MaterialListRow[];
  repairFields: RepairableMaterialField[];
}): Promise<{
  repair: ReturnType<typeof pdfTargetedRepairResultSchema.parse>;
  model: string;
  durationMs: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  estimatedCostUsd: number | null;
  repairedTargetCount: number;
  requestPayload: {
    repairFields: RepairableMaterialField[];
    targetCount: number;
    includesDxf: false;
  };
}> {
  const started = Date.now();
  const model = getSimpleIntakeOpenAiModel();
  const pdfDetail = getSimpleIntakePdfDetail();
  const targets = buildPdfRepairTargets(args.rows, args.repairFields);

  if (targets.length === 0) {
    return {
      repair: { rows: [] },
      model,
      durationMs: Date.now() - started,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      estimatedCostUsd: null,
      repairedTargetCount: 0,
      requestPayload: {
        repairFields: args.repairFields,
        targetCount: 0,
        includesDxf: false,
      },
    };
  }

  const userText = buildPdfTargetedRepairUserPrompt({
    repairFields: args.repairFields,
    targets,
  });

  if (/"entities"|"dxfBytes"|"dxfContent"/i.test(userText)) {
    throw Object.assign(new Error("REPAIR_PAYLOAD_CONTAINS_DXF"), {
      code: "REPAIR_PAYLOAD_CONTAINS_DXF",
      retryable: false,
    });
  }

  const response = await withTimeout(
    args.client.responses.parse({
      model,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: PDF_TARGETED_REPAIR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "input_file",
              file_id: args.fileId,
              detail: pdfDetail,
            },
            { type: "input_text", text: userText },
          ],
        },
      ],
      text: {
        format: zodTextFormat(
          pdfTargetedRepairResultSchema,
          "omega_pdf_material_list_targeted_repair_v1"
        ),
      },
    }),
    SIMPLE_INTAKE_TIMEOUT_MS
  );

  const parsed = response.output_parsed;
  if (!parsed) {
    throw Object.assign(new Error("EMPTY_REPAIR_OUTPUT"), {
      code: "EMPTY_REPAIR_OUTPUT",
      retryable: false,
    });
  }

  const repair = pdfTargetedRepairResultSchema.parse(parsed);
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
    repairedTargetCount: repair.rows.length,
    requestPayload: {
      repairFields: args.repairFields,
      targetCount: targets.length,
      includesDxf: false,
    },
  };
}
