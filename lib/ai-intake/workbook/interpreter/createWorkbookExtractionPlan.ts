/**
 * AI planner call — structured output only. Max usage enforced by orchestrator.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { WorkbookSnapshot } from "../../normalization/types";
import { buildPlannerInput } from "./buildPlannerInput";
import { aiWorkbookExtractionPlanSchema } from "./extractionPlanSchema";
import {
  WORKBOOK_PLANNER_SYSTEM_PROMPT,
  WORKBOOK_REPAIR_SYSTEM_PROMPT,
} from "./plannerPrompt";
import { normalizeFlatExpression } from "./validateExtractionPlan";
import type {
  PlanSource,
  WorkbookExtractionPlan,
  WorkbookPlanRepairFeedback,
  WorkbookProfile,
  WorkbookTablePlan,
} from "./types";
import { WORKBOOK_EXTRACTION_PLAN_SCHEMA } from "./types";

export async function createWorkbookExtractionPlan(args: {
  client: OpenAI;
  model: string;
  snapshot: WorkbookSnapshot;
  profile: WorkbookProfile;
}): Promise<{ plan: WorkbookExtractionPlan; modelName: string }> {
  const plannerInput = buildPlannerInput({
    snapshot: args.snapshot,
    profile: args.profile,
  });

  const userText = [
    "Create a workbook-extraction-plan/v1 for this workbook.",
    "Return structure instructions only — no final part rows.",
    "",
    `workbookId=${args.snapshot.documentId}`,
    `fileName=${args.snapshot.fileName}`,
    "",
    "PLANNER_INPUT_JSON:",
    JSON.stringify(plannerInput),
  ].join("\n");

  const response = await args.client.responses.parse({
    model: args.model,
    reasoning: { effort: "none" },
    input: [
      { role: "system", content: WORKBOOK_PLANNER_SYSTEM_PROMPT },
      { role: "user", content: userText },
    ],
    text: {
      format: zodTextFormat(
        aiWorkbookExtractionPlanSchema,
        "workbook_extraction_plan"
      ),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw Object.assign(new Error("OPENAI_SCHEMA"), { code: "OPENAI_SCHEMA" });
  }
  const modelPlan = aiWorkbookExtractionPlanSchema.parse(parsed);
  const plan = hydratePlan(modelPlan, args.profile, "AI_INITIAL_PLAN");
  return { plan, modelName: args.model };
}

export async function repairWorkbookExtractionPlan(args: {
  client: OpenAI;
  model: string;
  snapshot: WorkbookSnapshot;
  profile: WorkbookProfile;
  originalPlan: WorkbookExtractionPlan;
  feedback: WorkbookPlanRepairFeedback;
}): Promise<{ plan: WorkbookExtractionPlan; modelName: string }> {
  const plannerInput = buildPlannerInput({
    snapshot: args.snapshot,
    profile: args.profile,
  });

  const userText = [
    "Repair the extraction plan. Return a complete replacement plan.",
    "",
    `workbookId=${args.snapshot.documentId}`,
    "",
    "ORIGINAL_PLAN_JSON:",
    JSON.stringify(args.originalPlan),
    "",
    "REPAIR_FEEDBACK_JSON:",
    JSON.stringify(args.feedback),
    "",
    "PLANNER_INPUT_JSON:",
    JSON.stringify(plannerInput),
  ].join("\n");

  const response = await args.client.responses.parse({
    model: args.model,
    reasoning: { effort: "none" },
    input: [
      { role: "system", content: WORKBOOK_REPAIR_SYSTEM_PROMPT },
      { role: "user", content: userText },
    ],
    text: {
      format: zodTextFormat(
        aiWorkbookExtractionPlanSchema,
        "workbook_extraction_plan_repair"
      ),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw Object.assign(new Error("OPENAI_SCHEMA"), { code: "OPENAI_SCHEMA" });
  }
  const modelPlan = aiWorkbookExtractionPlanSchema.parse(parsed);
  const plan = hydratePlan(modelPlan, args.profile, "AI_REPAIRED_PLAN");
  return { plan, modelName: args.model };
}

function hydratePlan(
  model: ReturnType<typeof aiWorkbookExtractionPlanSchema.parse>,
  profile: WorkbookProfile,
  planSource: PlanSource
): WorkbookExtractionPlan {
  const tables: WorkbookTablePlan[] = model.tables.map((t) => ({
    tableId: t.tableId,
    sheetId: t.sheetId,
    sheetName: t.sheetName,
    region: t.region,
    tableRole: t.tableRole,
    rowMode: t.rowMode,
    headerRows: t.headerRows,
    dataRowSelector: {
      fromRow: t.dataRowSelector.fromRow,
      toRow: t.dataRowSelector.toRow,
      excludeRowNumbers: t.dataRowSelector.excludeRowNumbers ?? [],
    },
    fields: t.fields.map((f) => ({
      targetField: f.targetField,
      source: normalizeFlatExpression(f.source),
      transforms: f.transforms.map((tr) => ({
        kind: tr.kind,
        args: tr.args ?? undefined,
      })),
      expectedType: f.expectedType,
      explicitUnit: f.explicitUnit,
      aggregationSemantic: f.aggregationSemantic,
      required: f.required,
      confidence: f.confidence,
      reasons: f.reasons,
    })),
    rowClassification: {
      rules: t.rowClassification.rules.map((r) => ({
        class: r.class,
        ops: r.ops.map((op) => {
          if (op.kind === "REQUIRE_ANY_FIELD") {
            return { kind: "REQUIRE_ANY_FIELD" as const, fields: op.fields ?? [] };
          }
          if (op.kind === "REQUIRE_NUMERIC_FIELD") {
            return {
              kind: "REQUIRE_NUMERIC_FIELD" as const,
              field: op.field ?? "QUANTITY",
            };
          }
          if (op.kind === "MATCH_HEADER_SIGNATURE") {
            return {
              kind: "MATCH_HEADER_SIGNATURE" as const,
              tokens: op.tokens ?? undefined,
            };
          }
          return { kind: op.kind } as WorkbookTablePlan["rowClassification"]["rules"][0]["ops"][0];
        }),
      })),
      defaultClass: t.rowClassification.defaultClass,
    },
    constants: t.constants.map((c) => ({
      targetField: c.targetField,
      value: c.value,
      sourceAddress: c.sourceAddress,
    })),
    alignedHeaderText: t.alignedHeaderText,
    confidence: t.confidence,
    reasons: t.reasons,
  }));

  return {
    schemaVersion: WORKBOOK_EXTRACTION_PLAN_SCHEMA,
    workbookId: model.workbookId || profile.workbookId,
    planId: `plan:ai:${planSource}:${profile.fingerprint}`,
    confidence: model.confidence,
    status: model.status,
    workbookSummary: model.workbookSummary,
    tables,
    relationships: model.relationships,
    ambiguities: model.ambiguities.map((a) => ({
      code: a.code,
      message: a.message,
      sheetName: a.sheetName,
      tableId: a.tableId,
    })),
    warnings: model.warnings,
    planSource,
  };
}
