/**
 * AI Workbook Interpreter v1 — orchestrator.
 * Profile → (fast path | AI plan) → validate → execute → validate → optional repair.
 * Max 2 planner AI calls. No per-row AI.
 */

import type OpenAI from "openai";
import type { RawDocumentPartRow, WorkbookSnapshot } from "../../normalization/types";
import { buildWorkbookProfile } from "./buildWorkbookProfile";
import { tryBuildDeterministicFastPathPlan } from "./buildDeterministicFastPathPlan";
import {
  createWorkbookExtractionPlan,
  repairWorkbookExtractionPlan,
} from "./createWorkbookExtractionPlan";
import { executeWorkbookExtractionPlan } from "./executeExtractionPlan";
import { occurrencesToRawDocumentPartRows } from "./occurrencesToRawRows";
import { INTERPRETER_LIMITS } from "./types";
import type {
  WorkbookExtractionExecutionResult,
  WorkbookExtractionPlan,
  WorkbookExtractionValidation,
  WorkbookInterpreterDiagnostics,
  WorkbookMappingRequired,
  WorkbookProfile,
} from "./types";
import { validateExtractionPlan } from "./validateExtractionPlan";
import {
  buildMappingRequired,
  validateWorkbookExtractionResult,
} from "./validateExtractionResult";

export type InterpretWorkbookResult = {
  status: "SUCCESS" | "MAPPING_REQUIRED" | "FAIL";
  profile: WorkbookProfile;
  plan: WorkbookExtractionPlan | null;
  execution: WorkbookExtractionExecutionResult | null;
  validation: WorkbookExtractionValidation | null;
  partRows: RawDocumentPartRow[];
  skippedExcludedRows: RawDocumentPartRow[];
  mappingRequired: WorkbookMappingRequired | null;
  diagnostics: WorkbookInterpreterDiagnostics;
  warnings: string[];
};

export async function interpretWorkbook(args: {
  snapshot: WorkbookSnapshot;
  client?: OpenAI | null;
  model?: string | null;
  /** When true, allow AI planner if fast path is insufficient. */
  allowAiPlanner?: boolean;
}): Promise<InterpretWorkbookResult> {
  const started = Date.now();
  const warnings: string[] = [];
  const profile = buildWorkbookProfile(args.snapshot);
  let plannerCallCount = 0;
  let modelName: string | null = null;
  let repaired = false;
  let initialPlanValid: boolean | null = null;
  const plannerAttempts: WorkbookInterpreterDiagnostics["plannerAttempts"] = [];
  let planValidationErrors: string[] = [];

  if (profile.sheets.length === 0) {
    return failResult({
      profile,
      warnings: ["NO_SHEETS_PROFILED"],
      started,
      plannerCallCount: 0,
      modelName: null,
      reason: "NO_SHEETS",
      plannerAttempts: [],
      planValidationErrors: [],
    });
  }

  if (
    args.snapshot.sheets.length > INTERPRETER_LIMITS.maxSheetsBeforeMappingRequired
  ) {
    warnings.push("SHEET_COUNT_EXCEEDED_SUMMARY");
  }

  // 1) Deterministic fast path — must pass the same validator as AI plans
  let plan = tryBuildDeterministicFastPathPlan({
    snapshot: args.snapshot,
    profile,
  });
  let rejectedDeterministicPlan: WorkbookExtractionPlan | null = null;
  let rejectedDeterministicErrors: string[] = [];

  if (plan && plan.planSource === "DETERMINISTIC_FAST_PATH") {
    const fastValidation = validateExtractionPlan({
      snapshot: args.snapshot,
      profile,
      plan,
    });
    if (!fastValidation.ok) {
      rejectedDeterministicPlan = {
        ...plan,
        planSource: "DETERMINISTIC_FAST_PATH_REJECTED",
      };
      rejectedDeterministicErrors = [...fastValidation.errors];
      planValidationErrors = [...fastValidation.errors];
      warnings.push(
        ...fastValidation.errors.map((e) => `DETERMINISTIC_PLAN_REJECTED:${e}`)
      );
      // Do not execute an invalid deterministic plan
      plan = null;
    } else {
      plan = {
        ...plan,
        planSource: "DETERMINISTIC_FAST_PATH_VALIDATED",
      };
    }
  }

  // 2) AI planner when needed (missing plan, low confidence, or rejected fast path)
  if (
    (!plan || plan.confidence < 0.75 || rejectedDeterministicPlan != null) &&
    args.allowAiPlanner !== false &&
    args.client &&
    args.model
  ) {
    try {
      const ai = await createWorkbookExtractionPlan({
        client: args.client,
        model: args.model,
        snapshot: args.snapshot,
        profile,
      });
      plannerCallCount += 1;
      modelName = ai.modelName;
      plan = ai.plan;
      plannerAttempts.push({
        attempt: plannerCallCount,
        kind: "INITIAL",
        modelName: ai.modelName,
        status: "SUCCEEDED",
        errorMessage: null,
      });
      if (rejectedDeterministicErrors.length > 0) {
        warnings.push("AI_FALLBACK_AFTER_DETERMINISTIC_REJECTION");
      }
      warnings.push("AI_INITIAL_PLAN");
    } catch (err) {
      plannerCallCount += 1;
      plannerAttempts.push({
        attempt: plannerCallCount,
        kind: "INITIAL",
        modelName: args.model ?? null,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "unknown",
      });
      warnings.push(
        `AI_PLANNER_FAILED:${err instanceof Error ? err.message : "unknown"}`
      );
      if (!plan) {
        return mappingResult({
          profile,
          plan: rejectedDeterministicPlan,
          warnings,
          started,
          plannerCallCount,
          modelName,
          reasons: [
            "AI_PLANNER_FAILED",
            ...(rejectedDeterministicErrors.length
              ? ["DETERMINISTIC_PLAN_REJECTED"]
              : ["NO_FAST_PATH"]),
            ...rejectedDeterministicErrors,
          ],
          plannerAttempts,
          planValidationErrors,
        });
      }
    }
  }

  // If deterministic was rejected and AI unavailable/failed, do not execute invalid plan
  if (!plan && rejectedDeterministicPlan) {
    return mappingResult({
      profile,
      plan: rejectedDeterministicPlan,
      warnings,
      started,
      plannerCallCount,
      modelName,
      reasons: [
        "DETERMINISTIC_PLAN_REJECTED",
        ...rejectedDeterministicErrors,
      ],
      plannerAttempts,
      planValidationErrors: rejectedDeterministicErrors,
    });
  }

  if (!plan) {
    return mappingResult({
      profile,
      plan: null,
      warnings,
      started,
      plannerCallCount,
      modelName,
      reasons: ["NO_PLAN_AVAILABLE"],
      plannerAttempts,
      planValidationErrors,
    });
  }

  if (plan.status === "MAPPING_REQUIRED" || plan.status === "UNSUPPORTED") {
    return mappingResult({
      profile,
      plan,
      warnings,
      started,
      plannerCallCount,
      modelName,
      reasons: plan.ambiguities.map((a) => a.message),
      plannerAttempts,
      planValidationErrors,
    });
  }

  // 3) Validate plan
  let planValidation = validateExtractionPlan({
    snapshot: args.snapshot,
    profile,
    plan,
  });
  initialPlanValid = planValidation.ok;
  planValidationErrors = [...planValidation.errors];

  // 4) Execute + validate extraction; repair once if needed
  let execution: WorkbookExtractionExecutionResult | null = null;
  let validation: WorkbookExtractionValidation | null = null;

  const runExecuteValidate = (p: WorkbookExtractionPlan) => {
    const ex = executeWorkbookExtractionPlan({
      snapshot: args.snapshot,
      plan: p,
    });
    const val = validateWorkbookExtractionResult({
      snapshot: args.snapshot,
      plan: p,
      result: ex,
    });
    return { ex, val };
  };

  if (!planValidation.ok) {
    warnings.push(...planValidation.errors.map((e) => `PLAN_INVALID:${e}`));
    if (
      args.allowAiPlanner !== false &&
      args.client &&
      args.model &&
      plannerCallCount < INTERPRETER_LIMITS.maxPlannerCalls
    ) {
      try {
        const repairedPlan = await repairWorkbookExtractionPlan({
          client: args.client,
          model: args.model,
          snapshot: args.snapshot,
          profile,
          originalPlan: plan,
          feedback: {
            planValidationErrors: planValidation.errors,
            extractionErrors: [],
            failedRowSamples: [],
            unexplainedRowSamples: [],
            fieldCoverage: {},
          },
        });
        plannerCallCount += 1;
        repaired = true;
        modelName = repairedPlan.modelName;
        plan = repairedPlan.plan;
        plannerAttempts.push({
          attempt: plannerCallCount,
          kind: "REPAIR",
          modelName: repairedPlan.modelName,
          status: "SUCCEEDED",
          errorMessage: null,
        });
        planValidation = validateExtractionPlan({
          snapshot: args.snapshot,
          profile,
          plan,
        });
        planValidationErrors = [
          ...planValidationErrors,
          ...planValidation.errors,
        ];
        if (!planValidation.ok) {
          return mappingResult({
            profile,
            plan,
            warnings,
            started,
            plannerCallCount,
            modelName,
            reasons: planValidation.errors,
            plannerAttempts,
            planValidationErrors,
          });
        }
      } catch {
        plannerAttempts.push({
          attempt: plannerCallCount + 1,
          kind: "REPAIR",
          modelName: args.model ?? null,
          status: "FAILED",
          errorMessage: "REPAIR_EXCEPTION",
        });
        return mappingResult({
          profile,
          plan,
          warnings,
          started,
          plannerCallCount,
          modelName,
          reasons: planValidation.errors,
          plannerAttempts,
          planValidationErrors,
        });
      }
    } else {
      return mappingResult({
        profile,
        plan,
        warnings,
        started,
        plannerCallCount,
        modelName,
        reasons: planValidation.errors,
        plannerAttempts,
        planValidationErrors,
      });
    }
  }

  ({ ex: execution, val: validation } = runExecuteValidate(plan));

  if (
    (validation.status === "REPAIR_RECOMMENDED" ||
      validation.status === "FAIL") &&
    args.allowAiPlanner !== false &&
    args.client &&
    args.model &&
    plannerCallCount < INTERPRETER_LIMITS.maxPlannerCalls &&
    !repaired
  ) {
    try {
      const repairedPlan = await repairWorkbookExtractionPlan({
        client: args.client,
        model: args.model,
        snapshot: args.snapshot,
        profile,
        originalPlan: plan,
        feedback: validation.repairFeedback,
      });
      plannerCallCount += 1;
      repaired = true;
      modelName = repairedPlan.modelName;
      plan = repairedPlan.plan;

      const pv = validateExtractionPlan({
        snapshot: args.snapshot,
        profile,
        plan,
      });
      if (!pv.ok) {
        return mappingResult({
          profile,
          plan,
          warnings,
          started,
          plannerCallCount,
          modelName,
          reasons: pv.errors,
          plannerAttempts,
          planValidationErrors: [...planValidationErrors, ...pv.errors],
        });
      }
      plannerAttempts.push({
        attempt: plannerCallCount,
        kind: "REPAIR",
        modelName: repairedPlan.modelName,
        status: "SUCCEEDED",
        errorMessage: null,
      });
      ({ ex: execution, val: validation } = runExecuteValidate(plan));
    } catch (err) {
      plannerAttempts.push({
        attempt: plannerCallCount + 1,
        kind: "REPAIR",
        modelName: args.model ?? null,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "unknown",
      });
      warnings.push(
        `AI_REPAIR_FAILED:${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  // Enforce AI call cap invariant
  if (plannerCallCount > INTERPRETER_LIMITS.maxPlannerCalls) {
    throw new Error("ASSERT_PLANNER_CALL_CAP_EXCEEDED");
  }

  if (
    !validation ||
    validation.status === "MAPPING_REQUIRED" ||
    validation.status === "FAIL" ||
    (validation.status === "REPAIR_RECOMMENDED" && repaired)
  ) {
    // After repair still failing → mapping required (no misleading Review)
    if (
      validation &&
      (validation.status === "MAPPING_REQUIRED" ||
        validation.status === "FAIL" ||
        validation.status === "REPAIR_RECOMMENDED")
    ) {
      return mappingResult({
        profile,
        plan,
        warnings,
        started,
        plannerCallCount,
        modelName,
        reasons: validation.errors.map((e) => e.message),
        validation,
        execution,
        plannerAttempts,
        planValidationErrors,
      });
    }
  }

  if (!execution || !validation || !plan) {
    return failResult({
      profile,
      warnings,
      started,
      plannerCallCount,
      modelName,
      reason: "EXECUTION_INCOMPLETE",
      plannerAttempts,
      planValidationErrors,
    });
  }

  // Do not emit Working Quote rows from failed validation
  if (
    validation.status !== "PASS" &&
    validation.status !== "PASS_WITH_WARNINGS"
  ) {
    return mappingResult({
      profile,
      plan,
      warnings,
      started,
      plannerCallCount,
      modelName,
      reasons: validation.errors.map((e) => e.message),
      validation,
      execution,
      plannerAttempts,
      planValidationErrors,
    });
  }

  const partRows = occurrencesToRawDocumentPartRows({
    snapshot: args.snapshot,
    plan,
    occurrences: execution.occurrences,
  });

  const skippedExcludedRows = execution.skippedRows
    .filter((s) =>
      ["TOTAL", "SUBTOTAL", "FOOTER", "HEADER", "REPEATED_HEADER"].includes(
        s.classification
      )
    )
    .map((s) => ({
      occurrenceId: `skip:${args.snapshot.documentId}:${s.tableId}:${s.rowNumber}`,
      documentId: args.snapshot.documentId,
      rowRole:
        s.classification === "TOTAL"
          ? ("TOTAL" as const)
          : s.classification === "SUBTOTAL"
            ? ("SUBTOTAL" as const)
            : s.classification === "HEADER" ||
                s.classification === "REPEATED_HEADER"
              ? ("HEADER" as const)
              : ("NOTE" as const),
      matchedDxfPartId: null,
      rawPartReference: null,
      partReferenceCell: null,
      materialCell: null,
      quantity: null,
      thickness: null,
      material: null,
      width: null,
      height: null,
      area: null,
      totalArea: null,
      unitWeight: null,
      totalWeight: null,
      description: s.textPreview,
      notes: s.reason,
      source: {
        type: "XLSX" as const,
        fileName: args.snapshot.fileName,
        sheetName: s.sheetName,
        rowNumber: s.rowNumber,
        pageNumber: null,
        excerpt: s.textPreview,
        tableId: s.tableId,
      },
      extractionIssues: [`SKIPPED:${s.classification}`],
      isHiddenRow: false,
    }));

  const diagnostics: WorkbookInterpreterDiagnostics = {
    workbookId: args.snapshot.documentId,
    fingerprint: profile.fingerprint,
    profileVersion: profile.schemaVersion,
    planSource: plan.planSource,
    plannerCallCount,
    modelName,
    sheetsProfiled: profile.sheets.length,
    regionsDetected: profile.sheets.reduce((n, s) => n + s.regions.length, 0),
    tablesPlanned: plan.tables.length,
    initialPlanValid,
    repaired,
    finalStatus: validation.status,
    coverage: execution.coverage,
    mappingRequired: null,
    timingMs: Date.now() - started,
    profile,
    plan,
    validation,
    execution,
    planValidationErrors,
    plannerAttempts,
  };

  warnings.push(`INTERPRETER_PLAN_SOURCE:${plan.planSource}`);
  warnings.push(`INTERPRETER_PLANNER_CALLS:${plannerCallCount}`);

  return {
    status: "SUCCESS",
    profile,
    plan,
    execution,
    validation,
    partRows,
    skippedExcludedRows,
    mappingRequired: null,
    diagnostics,
    warnings,
  };
}

function mappingResult(args: {
  profile: WorkbookProfile;
  plan: WorkbookExtractionPlan | null;
  warnings: string[];
  started: number;
  plannerCallCount: number;
  modelName: string | null;
  reasons: string[];
  validation?: WorkbookExtractionValidation | null;
  execution?: WorkbookExtractionExecutionResult | null;
  plannerAttempts?: WorkbookInterpreterDiagnostics["plannerAttempts"];
  planValidationErrors?: string[];
}): InterpretWorkbookResult {
  const plannerAttempts = args.plannerAttempts ?? [];
  const planValidationErrors = args.planValidationErrors ?? [];
  const mappingRequired = args.plan
    ? buildMappingRequired({
        workbookId: args.profile.workbookId,
        plan: args.plan,
        validation:
          args.validation ??
          ({
            status: "MAPPING_REQUIRED",
            score: 0,
            metrics: [],
            errors: args.reasons.map((r) => ({
              code: "MAPPING_REQUIRED",
              severity: "ERROR" as const,
              message: r,
            })),
            warnings: [],
            repairFeedback: {
              planValidationErrors: args.reasons,
              extractionErrors: [],
              failedRowSamples: [],
              unexplainedRowSamples: [],
              fieldCoverage: {},
            },
          } satisfies WorkbookExtractionValidation),
      })
    : {
        status: "MAPPING_REQUIRED" as const,
        workbookId: args.profile.workbookId,
        detectedTables: [],
        questions: [],
        proposedMappings: [],
        reasons: args.reasons,
      };

  return {
    status: "MAPPING_REQUIRED",
    profile: args.profile,
    plan: args.plan,
    execution: args.execution ?? null,
    validation: args.validation ?? null,
    partRows: [],
    skippedExcludedRows: [],
    mappingRequired,
    diagnostics: {
      workbookId: args.profile.workbookId,
      fingerprint: args.profile.fingerprint,
      profileVersion: args.profile.schemaVersion,
      planSource: args.plan?.planSource ?? null,
      plannerCallCount: args.plannerCallCount,
      modelName: args.modelName,
      sheetsProfiled: args.profile.sheets.length,
      regionsDetected: args.profile.sheets.reduce(
        (n, s) => n + s.regions.length,
        0
      ),
      tablesPlanned: args.plan?.tables.length ?? 0,
      initialPlanValid: null,
      repaired: plannerAttempts.some((a) => a.kind === "REPAIR"),
      finalStatus: "MAPPING_REQUIRED",
      coverage: args.execution?.coverage ?? null,
      mappingRequired,
      timingMs: Date.now() - args.started,
      profile: args.profile,
      plan: args.plan,
      validation: args.validation ?? null,
      execution: args.execution ?? null,
      planValidationErrors,
      plannerAttempts,
    },
    warnings: [...args.warnings, "MAPPING_REQUIRED"],
  };
}

function failResult(args: {
  profile: WorkbookProfile;
  warnings: string[];
  started: number;
  plannerCallCount: number;
  modelName: string | null;
  reason: string;
  plannerAttempts?: WorkbookInterpreterDiagnostics["plannerAttempts"];
  planValidationErrors?: string[];
}): InterpretWorkbookResult {
  return {
    status: "FAIL",
    profile: args.profile,
    plan: null,
    execution: null,
    validation: null,
    partRows: [],
    skippedExcludedRows: [],
    mappingRequired: null,
    diagnostics: {
      workbookId: args.profile.workbookId,
      fingerprint: args.profile.fingerprint,
      profileVersion: args.profile.schemaVersion,
      planSource: null,
      plannerCallCount: args.plannerCallCount,
      modelName: args.modelName,
      sheetsProfiled: args.profile.sheets.length,
      regionsDetected: 0,
      tablesPlanned: 0,
      initialPlanValid: null,
      repaired: false,
      finalStatus: "FAIL",
      coverage: null,
      mappingRequired: null,
      timingMs: Date.now() - args.started,
      profile: args.profile,
      plan: null,
      validation: null,
      execution: null,
      planValidationErrors: args.planValidationErrors ?? [],
      plannerAttempts: args.plannerAttempts ?? [],
    },
    warnings: [...args.warnings, args.reason],
  };
}
