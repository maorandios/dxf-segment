/**
 * Five-step quote workflow presentation helpers.
 */

import type {
  OmegaQuoteStage,
  SimpleIntakeSession,
  WorkflowStepState,
} from "../types";

export type QuoteStepperId =
  | "MATERIAL_LIST"
  | "DXF_MATCHING"
  | "DATA_APPROVAL"
  | "QUOTE_PRICING"
  | "COMPLETED";

export const QUOTE_STEPPER_ORDER: QuoteStepperId[] = [
  "MATERIAL_LIST",
  "DXF_MATCHING",
  "DATA_APPROVAL",
  "QUOTE_PRICING",
  "COMPLETED",
];

export const QUOTE_STEPPER_LABELS: Record<QuoteStepperId, string> = {
  MATERIAL_LIST: "הפקת רשימת חומר",
  DXF_MATCHING: "התאמות קבצי DXF",
  DATA_APPROVAL: "אישור נתונים",
  QUOTE_PRICING: "תמחור הצעה",
  COMPLETED: "סיום",
};

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
      if (id === "MATERIAL_LIST" && attention?.materialNeedsCompletion) {
        result[id] = "ATTENTION";
      } else if (
        (id === "DXF_MATCHING" || id === "DATA_APPROVAL") &&
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
