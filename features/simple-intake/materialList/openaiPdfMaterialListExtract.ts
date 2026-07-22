/**
 * OpenAI PDF material-list extraction via Responses input_file.
 * Converges to the same MaterialListRow[] + quality gate + optional repair.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { SIMPLE_INTAKE_TIMEOUT_MS } from "../types";
import {
  adaptPdfMaterialListRows,
  buildPdfMaterialListStageDebug,
} from "./adaptPdfMaterialListRows";
import { decideRepairPlan } from "./decideRepairPlan";
import {
  estimatePdfPageCount,
  validateMaterialSourceBytes,
} from "./materialSourceTypes";
import {
  initializePrimaryFieldResolutions,
} from "./mergeRepair";
import { mergePdfTargetedRepair } from "./mergePdfRepair";
import { getSimpleIntakePdfDetail } from "./pdfConfig";
import {
  deleteProviderFileBestEffort,
  uploadPdfForMaterialExtraction,
} from "./pdfProviderFiles";
import {
  buildPdfMaterialExtractionPrompt,
  aiPdfMaterialListResultSchema,
} from "./pdfSchema";
import { runPdfTargetedMaterialRepair } from "./pdfTargetedRepair";
import {
  countDuplicateSourceRows,
  evaluateFinalValidationGate,
  evaluateQualityGate,
  measureFieldCoverageCounts,
} from "./qualityGate";
import { getSimpleIntakeOpenAiModel } from "./schema";
import { estimateOpenAiCostUsd } from "./targetedRepair";
import type {
  MaterialListQualityGateDebug,
  TargetedRepairDebug,
} from "./types";
import type { MaterialListExtractionResult } from "./openaiMaterialListExtract";

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

export async function runOpenAiPdfMaterialListExtraction(args: {
  pdfBytes: Buffer;
  fileName: string;
  mimeType?: string | null;
}): Promise<MaterialListExtractionResult & {
  pdfExtractionDebug: Record<string, unknown>;
  sourceDocument: Record<string, unknown>;
}> {
  const started = Date.now();
  const validated = validateMaterialSourceBytes({
    fileName: args.fileName,
    mimeType: args.mimeType,
    bytes: args.pdfBytes,
  });
  if (!validated.ok) {
    throw Object.assign(new Error(validated.message), {
      code: validated.code,
      retryable: false,
      messageHe: validated.message,
    });
  }
  if (validated.sourceType !== "PDF") {
    throw Object.assign(new Error("EXPECTED_PDF"), {
      code: "UNSUPPORTED_TYPE",
      retryable: false,
    });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = getSimpleIntakeOpenAiModel();
  const pdfDetail = getSimpleIntakePdfDetail();
  if (!apiKey) {
    throw Object.assign(new Error("MISSING_API_KEY"), {
      code: "MISSING_API_KEY",
      retryable: false,
    });
  }

  const client = new OpenAI({ apiKey });
  const pdfPageCount = estimatePdfPageCount(args.pdfBytes);
  let fileId: string | null = null;
  let providerFileDeleted: boolean | null = null;
  let cleanupError: string | null = null;
  let primaryDurationMs: number | null = null;
  let repairDurationMs: number | null = null;

  try {
    const uploaded = await uploadPdfForMaterialExtraction({
      client,
      bytes: args.pdfBytes,
      fileName: args.fileName,
    });
    fileId = uploaded.fileId;

    const tPrimary = Date.now();
    const response = await withTimeout(
      client.responses.parse({
        model,
        reasoning: { effort: "none" },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                file_id: fileId,
                detail: pdfDetail,
              },
              {
                type: "input_text",
                text: buildPdfMaterialExtractionPrompt(args.fileName),
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(
            aiPdfMaterialListResultSchema,
            "omega_pdf_material_list_v1"
          ),
        },
      }),
      SIMPLE_INTAKE_TIMEOUT_MS
    );
    primaryDurationMs = Date.now() - tPrimary;

    const parsed = response.output_parsed;
    if (!parsed) {
      throw Object.assign(new Error("Empty structured output"), {
        code: "EMPTY_STRUCTURED_OUTPUT",
        retryable: false,
      });
    }

    const tVal = Date.now();
    const validatedResult = aiPdfMaterialListResultSchema.parse(parsed);
    const adapted = adaptPdfMaterialListRows({
      result: validatedResult,
      sourceFileName: args.fileName,
    });
    let validationMs = Date.now() - tVal;

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

    const primaryUsage = { inputTokens, outputTokens, totalTokens };
    const primaryEstimatedCostUsd = estimateOpenAiCostUsd(
      inputTokens,
      outputTokens
    );

    let rows = initializePrimaryFieldResolutions(adapted.rows);
    const gateBefore = evaluateQualityGate(rows);
    const coverageCountsBefore = measureFieldCoverageCounts(rows);
    const duplicateBefore = countDuplicateSourceRows(rows);

    let providerCallCount: 1 | 2 = 1;
    let repairEstimatedCostUsd: number | null = null;
    const repairPlan = decideRepairPlan(rows);
    let targetedRepair: TargetedRepairDebug = {
      provider: "openai",
      model,
      callCount: 0,
      triggerType: repairPlan.triggerType,
      requestedRowCount: repairPlan.affectedRows.length,
      requestedFields: [...repairPlan.repairFields],
      repairedSourceRowCount: 0,
      exactValuesReturned: 0,
      exactValuesMerged: 0,
      rejectedExactValues: 0,
      rejectedReasons: [],
      unresolvedValues: 0,
      missingInSourceValues: 0,
      durationMs: null,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      estimatedCostUsd: null,
    };

    if (
      fileId &&
      repairPlan.triggerType !== "NONE" &&
      repairPlan.repairFields.length > 0 &&
      repairPlan.affectedRows.length > 0
    ) {
      const tRepair = Date.now();
      const repairOut = await runPdfTargetedMaterialRepair({
        client,
        fileId,
        rows: repairPlan.affectedRows,
        repairFields: repairPlan.repairFields,
      });
      repairDurationMs = Date.now() - tRepair;
      validationMs += repairDurationMs;

      const merged = mergePdfTargetedRepair({
        rows,
        repair: repairOut.repair,
        repairFields: repairPlan.repairFields,
      });
      rows = merged.rows;
      providerCallCount = 2;
      repairEstimatedCostUsd = repairOut.estimatedCostUsd;
      targetedRepair = {
        provider: "openai",
        model: repairOut.model,
        callCount: 1,
        triggerType: repairPlan.triggerType,
        requestedRowCount: repairPlan.affectedRows.length,
        requestedFields: [...repairPlan.repairFields],
        repairedSourceRowCount: repairOut.repairedTargetCount,
        exactValuesReturned: merged.stats.exactValuesReturned,
        exactValuesMerged: merged.stats.exactValuesMerged,
        rejectedExactValues: merged.stats.rejectedExactValues,
        rejectedReasons: merged.stats.rejectedReasons.map((r) => ({
          sheetName: "PDF",
          sourceRow: 0,
          field: "material" as const,
          value: r.value,
          reason: r.reason,
        })),
        unresolvedValues: merged.stats.unresolvedValues,
        missingInSourceValues: merged.stats.missingInSourceValues,
        durationMs: repairOut.durationMs,
        usage: repairOut.usage,
        estimatedCostUsd: repairOut.estimatedCostUsd,
      };
    }

    const finalGate = evaluateFinalValidationGate(rows);
    const coverageCountsAfter = measureFieldCoverageCounts(rows);
    const duplicateAfter = countDuplicateSourceRows(rows);

    const qualityGate: MaterialListQualityGateDebug = {
      passedBeforeRepair: gateBefore.passed,
      passedAfterRepair: finalGate.passed,
      fieldCoverageBefore: coverageCountsBefore,
      fieldCoverageAfter: coverageCountsAfter,
      triggeredRepair: targetedRepair.callCount === 1,
      repairFields: repairPlan.repairFields,
      triggerReasons:
        repairPlan.reasons.length > 0
          ? repairPlan.reasons
          : gateBefore.triggerReasons,
      duplicateSourceRowsBefore: duplicateBefore,
      duplicateSourceRowsAfter: duplicateAfter,
      unresolvedFieldCount: finalGate.unresolvedFieldCount,
      missingInSourceFieldCount: finalGate.missingInSourceFieldCount,
    };

    const totalEstimatedCostUsd =
      primaryEstimatedCostUsd == null && repairEstimatedCostUsd == null
        ? null
        : (primaryEstimatedCostUsd ?? 0) + (repairEstimatedCostUsd ?? 0);

    const repairIn = targetedRepair.usage.inputTokens;
    const repairOutTok = targetedRepair.usage.outputTokens;
    const repairTot = targetedRepair.usage.totalTokens;
    const combinedUsage = {
      inputTokens:
        primaryUsage.inputTokens == null && repairIn == null
          ? null
          : (primaryUsage.inputTokens ?? 0) + (repairIn ?? 0),
      outputTokens:
        primaryUsage.outputTokens == null && repairOutTok == null
          ? null
          : (primaryUsage.outputTokens ?? 0) + (repairOutTok ?? 0),
      totalTokens:
        primaryUsage.totalTokens == null && repairTot == null
          ? null
          : (primaryUsage.totalTokens ?? 0) + (repairTot ?? 0),
    };

    const materialListStageDebug = {
      ...buildPdfMaterialListStageDebug({
        model,
        rows,
        diagnostics: {
          ...adapted.diagnostics,
          validatedRowCount: rows.length,
        },
      }),
      usage: primaryUsage,
      adaptDiagnostics: adapted.diagnostics,
      qualityGate,
      targetedRepair,
      costs: {
        primaryEstimatedCostUsd,
        repairEstimatedCostUsd,
        totalEstimatedCostUsd,
      },
      qualityGatePassed: finalGate.passed,
      finalValidationReasons: finalGate.reasons,
    };

    const itemsWithSourcePage = rows.filter(
      (r) => r.sourcePage != null && r.sourcePage > 0
    ).length;
    const itemsWithSourceAnchor = rows.filter((r) =>
      Boolean(r.sourceAnchorText?.trim())
    ).length;

    const cleanup = await deleteProviderFileBestEffort({ client, fileId });
    providerFileDeleted = cleanup.deleted;
    cleanupError = cleanup.error;
    // Keep fileId for finally retry when best-effort delete failed.
    if (cleanup.deleted) fileId = null;

    const pdfExtractionDebug = {
      uploadedProviderFile: true,
      providerFileDeleted,
      primaryCallCount: 1,
      repairCallCount: targetedRepair.callCount,
      extractedItemCount: rows.length,
      itemsWithSourcePage,
      itemsWithSourceAnchor,
      primaryDurationMs,
      repairDurationMs,
      usage: combinedUsage,
      estimatedCostUsd: totalEstimatedCostUsd,
      cleanupError,
    };

    const sourceDocument = {
      sourceType: "PDF" as const,
      fileName: args.fileName,
      mimeType: validated.mimeType,
      fileSizeBytes: validated.fileSizeBytes,
      excelSheetCount: null,
      pdfPageCount,
      pdfDetail,
    };

    return {
      rows,
      providerCallCount,
      model,
      usage: combinedUsage,
      primaryUsage,
      primaryEstimatedCostUsd,
      repairEstimatedCostUsd,
      totalEstimatedCostUsd,
      qualityGatePassed: finalGate.passed,
      qualityGate,
      targetedRepair,
      materialListStageDebug,
      extractionProviderDebug: {
        provider: "openai",
        apiVersion: "responses",
        model,
        schemaVersion: "material-list-v1-pdf",
        sourceType: "PDF",
        providerCall: {
          provider: "openai",
          count: providerCallCount,
          purpose:
            providerCallCount === 2
              ? "MATERIAL_LIST_EXTRACTION_PLUS_REPAIR"
              : "MATERIAL_LIST_EXTRACTION",
        },
        qualityGate,
        targetedRepair,
        pdfExtraction: pdfExtractionDebug,
        sourceDocument,
      },
      durationMs: Date.now() - started,
      validationMs,
      pdfExtractionDebug,
      sourceDocument,
    };
  } finally {
    // Best-effort cleanup if we exited early (errors before explicit cleanup).
    if (fileId) {
      await deleteProviderFileBestEffort({ client, fileId });
    }
  }
}
