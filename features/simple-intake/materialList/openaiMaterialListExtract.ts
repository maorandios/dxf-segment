/**
 * OpenAI Mini extraction for Stage 1 material list (snapshot only).
 * Primary call unchanged; optional single targeted repair after quality gate.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { buildSimpleAnalyzeUserText } from "../buildAnalyzeRequest";
import { SIMPLE_INTAKE_TIMEOUT_MS } from "../types";
import {
  adaptMaterialListRows,
  buildMaterialListStageDebug,
} from "./adaptMaterialListRows";
import { decideRepairPlan } from "./decideRepairPlan";
import {
  countDuplicateSourceRows,
  evaluateFinalValidationGate,
  evaluateQualityGate,
  measureFieldCoverageCounts,
} from "./qualityGate";
import {
  initializePrimaryFieldResolutions,
  mergeTargetedRepair,
} from "./mergeRepair";
import {
  aiMaterialListResultSchema,
  getSimpleIntakeOpenAiModel,
  MATERIAL_LIST_SYSTEM_PROMPT,
} from "./schema";
import {
  estimateOpenAiCostUsd,
  runTargetedMaterialRepair,
} from "./targetedRepair";
import type {
  MaterialListQualityGateDebug,
  MaterialListRow,
  TargetedRepairDebug,
} from "./types";

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
  providerCallCount: 1 | 2;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  primaryUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  primaryEstimatedCostUsd: number | null;
  repairEstimatedCostUsd: number | null;
  totalEstimatedCostUsd: number | null;
  qualityGatePassed: boolean;
  qualityGate: MaterialListQualityGateDebug;
  targetedRepair: TargetedRepairDebug;
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
      retryable: false,
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
      retryable: false,
    });
  }

  const tVal = Date.now();
  const validated = aiMaterialListResultSchema.parse(parsed);
  const adapted = adaptMaterialListRows(validated, {
    sourceFileName: args.snapshot.filename,
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
    repairPlan.triggerType !== "NONE" &&
    repairPlan.repairFields.length > 0 &&
    repairPlan.affectedRows.length > 0
  ) {
    const tRepair = Date.now();
    const repairOut = await runTargetedMaterialRepair({
      snapshot: args.snapshot,
      rows: repairPlan.affectedRows,
      repairFields: repairPlan.repairFields,
    });
    validationMs += Date.now() - tRepair;

    const merged = mergeTargetedRepair({
      rows,
      repair: repairOut.repair,
      repairFields: repairPlan.repairFields,
      sourceContexts: repairOut.sourceContexts,
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
      repairedSourceRowCount: repairOut.repairedSourceRowCount,
      exactValuesReturned: merged.stats.exactValuesReturned,
      exactValuesMerged: merged.stats.exactValuesMerged,
      rejectedExactValues: merged.stats.rejectedExactValues,
      rejectedReasons: merged.stats.rejectedReasons,
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
  const repairOut = targetedRepair.usage.outputTokens;
  const repairTot = targetedRepair.usage.totalTokens;
  const combinedUsage = {
    inputTokens:
      primaryUsage.inputTokens == null && repairIn == null
        ? null
        : (primaryUsage.inputTokens ?? 0) + (repairIn ?? 0),
    outputTokens:
      primaryUsage.outputTokens == null && repairOut == null
        ? null
        : (primaryUsage.outputTokens ?? 0) + (repairOut ?? 0),
    totalTokens:
      primaryUsage.totalTokens == null && repairTot == null
        ? null
        : (primaryUsage.totalTokens ?? 0) + (repairTot ?? 0),
  };

  const materialListStageDebug = {
    ...buildMaterialListStageDebug({
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
      schemaVersion: "material-list-v1",
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
    },
    durationMs: Date.now() - started,
    validationMs,
  };
}
