/**
 * Five-step quote workflow presentation helpers.
 * Stage order: DXF → material → unified review → pricing → completed.
 * Labels reuse the existing Hebrew step copy, remapped to the new order.
 */

import type {
  OmegaQuoteStage,
  SimpleIntakeSession,
  WorkflowStepState,
} from "../types";

export type QuoteStepperId =
  | "DXF_INTAKE"
  | "MATERIAL_INTAKE"
  | "UNIFIED_REVIEW"
  | "QUOTE_PRICING"
  | "COMPLETED";

export const QUOTE_STEPPER_ORDER: QuoteStepperId[] = [
  "DXF_INTAKE",
  "MATERIAL_INTAKE",
  "UNIFIED_REVIEW",
  "QUOTE_PRICING",
  "COMPLETED",
];

/** Existing step labels remapped to the DXF-first order. */
export const QUOTE_STEPPER_LABELS: Record<QuoteStepperId, string> = {
  DXF_INTAKE: "התאמות קבצי DXF",
  MATERIAL_INTAKE: "הפקת רשימת חומר",
  UNIFIED_REVIEW: "אישור נתונים",
  QUOTE_PRICING: "תמחור הצעה",
  COMPLETED: "סיום",
};

export const WORKFLOW_STAGE_ORDER_DEBUG = [
  "DXF_INTAKE",
  "MATERIAL_INTAKE",
  "UNIFIED_REVIEW",
  "QUOTE_PRICING",
  "COMPLETED",
] as const;

export function quoteStageToStepperId(
  stage: OmegaQuoteStage
): QuoteStepperId | null {
  if (stage === "QUOTE_SETUP") return null;
  return stage;
}

export function deriveQuoteStepperStates(
  stage: OmegaQuoteStage,
  attention?: {
    materialNeedsCompletion?: boolean;
    dxfNeedsAttention?: boolean;
  }
): Record<QuoteStepperId, WorkflowStepState> {
  const currentId = quoteStageToStepperId(stage);
  const currentIndex = currentId
    ? QUOTE_STEPPER_ORDER.indexOf(currentId)
    : -1;

  const result = {} as Record<QuoteStepperId, WorkflowStepState>;
  for (let i = 0; i < QUOTE_STEPPER_ORDER.length; i++) {
    const id = QUOTE_STEPPER_ORDER[i]!;
    if (currentIndex < 0) {
      result[id] = "UPCOMING";
      continue;
    }
    if (i < currentIndex) {
      if (id === "MATERIAL_INTAKE" && attention?.materialNeedsCompletion) {
        result[id] = "ATTENTION";
      } else if (
        (id === "DXF_INTAKE" || id === "UNIFIED_REVIEW") &&
        attention?.dxfNeedsAttention
      ) {
        result[id] = "ATTENTION";
      } else {
        result[id] = "COMPLETED";
      }
    } else if (i === currentIndex) {
      result[id] = "ACTIVE";
    } else {
      result[id] = "UPCOMING";
    }
  }
  return result;
}

export function deriveOmegaQuoteStage(
  session: SimpleIntakeSession
): OmegaQuoteStage {
  if (!session.quoteDetails) return "QUOTE_SETUP";
  return session.quoteStage;
}

export function buildWorkflowDebug(args: {
  activeStage: OmegaQuoteStage;
  dxfParsedBeforeMaterialExtraction: boolean;
  reusedExistingDxfRegistry: boolean;
  materialExtractionCompleted: boolean;
  dxfMatchingCompleted: boolean;
  unifiedReviewCreated: boolean;
}): Record<string, unknown> {
  return {
    stageOrder: [...WORKFLOW_STAGE_ORDER_DEBUG],
    activeStage: args.activeStage,
    dxfParsedBeforeMaterialExtraction: args.dxfParsedBeforeMaterialExtraction,
    reusedExistingDxfRegistry: args.reusedExistingDxfRegistry,
    materialExtractionCompleted: args.materialExtractionCompleted,
    dxfMatchingCompleted: args.dxfMatchingCompleted,
    unifiedReviewCreated: args.unifiedReviewCreated,
  };
}
