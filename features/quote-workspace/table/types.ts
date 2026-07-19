/**
 * Working Quote Table domain types (presentation layer over Review Session).
 */

import type {
  IntakeReviewSession,
  ReviewField,
  ReviewIssue,
  ReviewPartRow,
  ReviewSourceReference,
} from "@/lib/ai-intake/review";
import type { QuoteTableFilter, QuoteTableSortKey } from "../types";

export type QuoteTableColumnKey =
  | "partReference"
  | "quantity"
  | "material"
  | "thicknessMm"
  | "widthMm"
  | "heightMm"
  | "plateAreaM2"
  | "unitWeightKg"
  | "totalWeightKg"
  | "includeInQuote"
  | "status";

export type QuoteTableColumnDataType =
  | "TEXT"
  | "INTEGER"
  | "DECIMAL"
  | "MATERIAL"
  | "MEASUREMENT"
  | "BOOLEAN"
  | "STATUS";

export type QuoteTablePresentationStatus =
  | "READY"
  | "NEEDS_REVIEW"
  | "WARNING"
  | "EXCLUDED";

export type QuoteTableColumnDefinition = {
  key: QuoteTableColumnKey;
  label: string;
  dataType: QuoteTableColumnDataType;
  visible: boolean;
  editable: boolean;
  requiredForApproval: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  unit?: string | null;
  decimalPlaces?: number | null;
  align?: "START" | "CENTER" | "END";
  getValue: (row: ReviewPartRow) => unknown;
  getFieldState?: (row: ReviewPartRow) => ReviewField<unknown>["state"] | null;
};

export type QuoteTableRowViewModel = {
  rowId: string;
  displayOrder: number;
  displayPartReference: string;
  matchedDxfPartId: string | null;
  quantity: number | null;
  quantityProposed: number | null;
  quantityEdited: boolean;
  material: string | null;
  materialProposed: string | null;
  materialEdited: boolean;
  thicknessMm: number | null;
  thicknessProposed: number | null;
  thicknessEdited: boolean;
  widthMm: number | null;
  heightMm: number | null;
  plateAreaMm2: number | null;
  plateAreaM2: number | null;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  massDisplaySafe: boolean;
  includeInQuote: boolean;
  presentationStatus: QuoteTablePresentationStatus;
  /** Human-facing status override for DXF ambiguity. */
  statusLabelOverrideHe: string | null;
  dxfMatchStatus: string | null;
  dxfMatchMethod: string | null;
  dxfMatchReason: string | null;
  dxfCandidateCount: number;
  requiresDxfChoice: boolean;
  fieldIssueKeys: Partial<Record<QuoteTableColumnKey, true>>;
  blockingIssueCount: number;
  warningIssueCount: number;
  issueIds: string[];
  /** Original row reference — do not mutate. */
  sourceRow: ReviewPartRow;
};

export type QuoteTableSummaryCounters = {
  totalParts: number;
  needsReview: number;
  warnings: number;
  ready: number;
  excluded: number;
  uniqueBlockingIssues: number;
  uniqueWarningIssues: number;
};

export type QuoteTableViewModel = {
  rows: QuoteTableRowViewModel[];
  visibleRows: QuoteTableRowViewModel[];
  counters: QuoteTableSummaryCounters;
  filterCounts: Record<QuoteTableFilter, number>;
  issuesById: Map<string, ReviewIssue>;
  reviewSession: IntakeReviewSession;
};

export type QuoteTableSortState = {
  key: QuoteTableSortKey | null;
  dir: "asc" | "desc";
};

export type QuoteEvidenceFieldBlock = {
  fieldKey: string;
  labelHe: string;
  proposedValue: unknown;
  currentValue: unknown;
  editedByUser: boolean;
  state: string;
  sourceRefs: ReviewSourceReference[];
};

export type QuoteValidationCheck = {
  id: string;
  labelHe: string;
};
