/**
 * Validate extraction plan before execution (whitelist + structural safety).
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { validateSafeRegexPattern } from "./safeRegex";
import type {
  ExtractionExpression,
  WorkbookExtractionPlan,
  WorkbookProfile,
  WorkbookTablePlan,
} from "./types";
import { ALLOWED_OPERATIONS, ALLOWED_TRANSFORMS } from "./buildPlannerInput";
import { columnLetterToNumber } from "./columnUtils";
import { validateFieldUnitCompatibility } from "./semanticFieldRegistry";

export type PlanValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function collectOps(expr: ExtractionExpression, ops: string[]): void {
  ops.push(expr.op);
  if (expr.op === "COALESCE") {
    for (const s of expr.sources) collectOps(s, ops);
  }
  if (expr.op === "PARSE_PROFILE") {
    collectOps(expr.from, ops);
  }
}

function expressionFromFlat(source: ExtractionExpression): ExtractionExpression {
  return source;
}

export function validateExtractionPlan(args: {
  snapshot: WorkbookSnapshot;
  profile: WorkbookProfile;
  plan: WorkbookExtractionPlan;
}): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (args.plan.schemaVersion !== "workbook-extraction-plan/v1") {
    errors.push("INVALID_SCHEMA_VERSION");
  }
  if (args.plan.workbookId !== args.snapshot.documentId) {
    errors.push("WORKBOOK_ID_MISMATCH");
  }

  const sheetNames = new Set(args.snapshot.sheets.map((s) => s.sheetName));
  const sheetIds = new Set(args.profile.sheets.map((s) => s.sheetId));
  const tableIds = new Set<string>();

  if (
    args.plan.status === "MAPPING_REQUIRED" ||
    args.plan.status === "UNSUPPORTED"
  ) {
    return { ok: false, errors: [`PLAN_STATUS_${args.plan.status}`], warnings };
  }

  for (const table of args.plan.tables) {
    if (tableIds.has(table.tableId)) {
      errors.push(`DUPLICATE_TABLE_ID:${table.tableId}`);
    }
    tableIds.add(table.tableId);

    if (!sheetNames.has(table.sheetName)) {
      errors.push(`UNKNOWN_SHEET:${table.sheetName}`);
    }
    if (!sheetIds.has(table.sheetId)) {
      warnings.push(`UNKNOWN_SHEET_ID:${table.sheetId}`);
    }

    validateTableRegion(args.snapshot, table, errors);
    validateTableFields(args.snapshot, table, errors, warnings);

    if (table.tableRole === "SUMMARY") {
      const hasPartFields = table.fields.some(
        (f) =>
          f.targetField === "EXPLICIT_PART_IDENTIFIER" ||
          f.targetField === "QUANTITY"
      );
      if (hasPartFields && table.confidence < 0.9) {
        errors.push(`SUMMARY_AS_PART_LIST:${table.tableId}`);
      }
    }

    // Profile → identifier silent mapping check
    for (const field of table.fields) {
      if (
        field.targetField === "EXPLICIT_PART_IDENTIFIER" &&
        field.reasons.some((r) => /profile|פרופיל/i.test(r))
      ) {
        errors.push(`PROFILE_AS_IDENTIFIER:${table.tableId}`);
      }
    }

    // Cannot classify every row as DATA without classification rules
    if (
      table.rowClassification.defaultClass === "DATA_OCCURRENCE" &&
      table.rowClassification.rules.length === 0
    ) {
      warnings.push(`WEAK_ROW_CLASSIFICATION:${table.tableId}`);
    }
  }

  // Cyclic relationships
  const relErrors = detectCyclicRelationships(args.plan);
  errors.push(...relErrors);

  // Confidence alone is not proof
  if (args.plan.confidence >= 0.99 && args.plan.tables.length === 0) {
    errors.push("EMPTY_HIGH_CONFIDENCE_PLAN");
  }

  if (args.plan.tables.length === 0) {
    errors.push("NO_TABLES_PLANNED");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateTableRegion(
  snapshot: WorkbookSnapshot,
  table: WorkbookTablePlan,
  errors: string[]
): void {
  const sheet = snapshot.sheets.find((s) => s.sheetName === table.sheetName);
  if (!sheet) return;

  const rows = sheet.cells.map((c) => c.rowNumber);
  const minR = rows.length ? Math.min(...rows) : 1;
  const maxR = rows.length ? Math.max(...rows) : 1;

  if (table.region.startRow < 1 || table.region.endRow < table.region.startRow) {
    errors.push(`INVALID_REGION:${table.tableId}`);
  }
  if (table.region.startRow < minR - 5 || table.region.endRow > maxR + 5) {
    errors.push(`REGION_OUTSIDE_USED_RANGE:${table.tableId}`);
  }

  for (const hr of table.headerRows) {
    if (hr < table.region.startRow || hr > table.region.endRow) {
      errors.push(`HEADER_OUTSIDE_REGION:${table.tableId}:${hr}`);
    }
  }

  const sel = table.dataRowSelector;
  if (sel.fromRow < table.region.startRow) {
    errors.push(`DATA_SELECTOR_BEFORE_REGION:${table.tableId}`);
  }
  if (sel.toRow != null && sel.toRow > table.region.endRow) {
    errors.push(`DATA_SELECTOR_AFTER_REGION:${table.tableId}`);
  }
}

function validateTableFields(
  snapshot: WorkbookSnapshot,
  table: WorkbookTablePlan,
  errors: string[],
  warnings: string[]
): void {
  const sheet = snapshot.sheets.find((s) => s.sheetName === table.sheetName);
  const addresses = new Set(sheet?.cells.map((c) => c.cellAddress) ?? []);
  const allowedOps = new Set<string>(ALLOWED_OPERATIONS);
  const allowedTransforms = new Set<string>(ALLOWED_TRANSFORMS);

  for (const field of table.fields) {
    const ops: string[] = [];
    collectOps(expressionFromFlat(field.source), ops);
    for (const op of ops) {
      if (!allowedOps.has(op)) {
        errors.push(`UNSUPPORTED_OP:${op}:${field.targetField}`);
      }
    }
    for (const t of field.transforms) {
      if (!allowedTransforms.has(t.kind)) {
        errors.push(`UNSUPPORTED_TRANSFORM:${t.kind}`);
      }
    }

    validateExpressionAddresses(field.source, addresses, errors, warnings);

    if (field.source.op === "REGEX_CAPTURE") {
      const safe = validateSafeRegexPattern(field.source.pattern);
      if (!safe.ok) {
        errors.push(`UNSAFE_REGEX:${safe.reason}:${field.source.pattern}`);
      }
    }

    if (
      field.explicitUnit &&
      !["MM", "CM", "M", "MM2", "CM2", "M2", "G", "KG", "TON"].includes(
        field.explicitUnit
      )
    ) {
      errors.push(`UNSUPPORTED_UNIT:${field.explicitUnit}`);
    }

    const semantic = validateFieldUnitCompatibility({
      targetField: field.targetField,
      explicitUnit: field.explicitUnit,
      expectedType: field.expectedType,
      aggregationSemantic: field.aggregationSemantic,
    });
    if (!semantic.ok && semantic.code) {
      errors.push(
        `${semantic.code}:${field.targetField}:${semantic.message ?? ""}`
      );
    }
  }
}

function validateExpressionAddresses(
  expr: ExtractionExpression,
  addresses: Set<string>,
  errors: string[],
  warnings: string[]
): void {
  if (expr.op === "READ_CELL" || expr.op === "READ_CONSTANT_CELL") {
    if (!addresses.has(expr.address)) {
      errors.push(`INVENTED_CELL:${expr.address}`);
    }
  }
  if (expr.op === "COALESCE") {
    for (const s of expr.sources) {
      validateExpressionAddresses(s, addresses, errors, warnings);
    }
  }
  if (expr.op === "PARSE_PROFILE") {
    validateExpressionAddresses(expr.from, addresses, errors, warnings);
  }
  if (expr.op === "READ_COLUMN_CELL" || expr.op === "READ_HEADER_RELATIVE_CELL") {
    if (!/^[A-Z]+$/i.test(expr.columnLetter)) {
      errors.push(`INVALID_COLUMN:${expr.columnLetter}`);
    }
  }
  void columnLetterToNumber;
  void warnings;
}

function detectCyclicRelationships(plan: WorkbookExtractionPlan): string[] {
  const errors: string[] = [];
  const adj = new Map<string, string[]>();
  for (const rel of plan.relationships) {
    const list = adj.get(rel.leftTableId) ?? [];
    list.push(rel.rightTableId);
    adj.set(rel.leftTableId, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const id of adj.keys()) {
    if (dfs(id)) {
      errors.push(`CYCLIC_RELATIONSHIP:${id}`);
      break;
    }
  }
  return errors;
}

/** Normalize AI flat expression into typed ExtractionExpression. */
export function normalizeFlatExpression(raw: {
  op: string;
  columnLetter?: string | null;
  address?: string | null;
  segmentIndex?: number | null;
  delimiter?: string | null;
  pattern?: string | null;
  groupIndex?: number | null;
  headerText?: string | null;
  headerSemantic?: string | null;
  columnLetters?: string[] | null;
  separator?: string | null;
  coalesceColumnLetters?: string[] | null;
}): ExtractionExpression {
  switch (raw.op) {
    case "READ_COLUMN_CELL":
      return {
        op: "READ_COLUMN_CELL",
        columnLetter: String(raw.columnLetter ?? "A"),
      };
    case "READ_HEADER_RELATIVE_CELL":
      return {
        op: "READ_HEADER_RELATIVE_CELL",
        columnLetter: String(raw.columnLetter ?? "A"),
      };
    case "READ_CELL":
      return { op: "READ_CELL", address: String(raw.address ?? "") };
    case "READ_CONSTANT_CELL":
      return { op: "READ_CONSTANT_CELL", address: String(raw.address ?? "") };
    case "READ_PREVIOUS_NON_EMPTY":
      return {
        op: "READ_PREVIOUS_NON_EMPTY",
        columnLetter: String(raw.columnLetter ?? "A"),
      };
    case "SPLIT_ALIGNED_TEXT":
      return {
        op: "SPLIT_ALIGNED_TEXT",
        columnLetter: String(raw.columnLetter ?? "A"),
        segmentIndex: raw.segmentIndex ?? 0,
        headerText: raw.headerText ?? null,
      };
    case "EXTRACT_BY_HEADER_SPAN":
      return {
        op: "EXTRACT_BY_HEADER_SPAN",
        columnLetter: String(raw.columnLetter ?? "A"),
        headerSemantic: String(raw.headerSemantic ?? "UNKNOWN"),
        segmentIndex: raw.segmentIndex ?? undefined,
      };
    case "SPLIT_DELIMITED_TEXT":
      return {
        op: "SPLIT_DELIMITED_TEXT",
        columnLetter: String(raw.columnLetter ?? "A"),
        delimiter: String(raw.delimiter ?? ","),
        segmentIndex: raw.segmentIndex ?? 0,
      };
    case "REGEX_CAPTURE":
      return {
        op: "REGEX_CAPTURE",
        columnLetter: String(raw.columnLetter ?? "A"),
        pattern: String(raw.pattern ?? ""),
        groupIndex: raw.groupIndex ?? 1,
      };
    case "COMBINE_CELLS":
      return {
        op: "COMBINE_CELLS",
        columnLetters: raw.columnLetters ?? [],
        separator: raw.separator ?? " ",
      };
    case "COALESCE":
      return {
        op: "COALESCE",
        sources: (raw.coalesceColumnLetters ?? []).map((c) => ({
          op: "READ_COLUMN_CELL" as const,
          columnLetter: c,
        })),
      };
    case "PARSE_PROFILE":
      return {
        op: "PARSE_PROFILE",
        from: {
          op: "READ_COLUMN_CELL",
          columnLetter: String(raw.columnLetter ?? "A"),
        },
      };
    default:
      return {
        op: "READ_COLUMN_CELL",
        columnLetter: String(raw.columnLetter ?? "A"),
      };
  }
}
