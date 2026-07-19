/**
 * Build bounded planner input from profile + representative rows.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { buildColumnStatistics } from "./buildColumnStatistics";
import { cellText } from "./columnUtils";
import {
  INTERPRETER_LIMITS,
  type OmegaWorkbookTargetField,
  type WorkbookProfile,
} from "./types";

export const OMEGA_TARGET_SCHEMA: OmegaWorkbookTargetField[] = [
  "EXPLICIT_PART_IDENTIFIER",
  "SOURCE_DESCRIPTOR",
  "PROFILE",
  "QUANTITY",
  "MATERIAL",
  "THICKNESS",
  "WIDTH",
  "LENGTH",
  "AREA",
  "UNIT_WEIGHT",
  "TOTAL_WEIGHT",
  "NOTES",
  "INCLUDE_OR_EXCLUDE_SIGNAL",
];

export const ALLOWED_OPERATIONS = [
  "READ_CELL",
  "READ_COLUMN_CELL",
  "READ_HEADER_RELATIVE_CELL",
  "READ_MERGED_CELL",
  "READ_CONSTANT_CELL",
  "READ_RANGE",
  "READ_PREVIOUS_NON_EMPTY",
  "COMBINE_CELLS",
  "SPLIT_DELIMITED_TEXT",
  "SPLIT_ALIGNED_TEXT",
  "EXTRACT_BY_HEADER_SPAN",
  "REGEX_CAPTURE",
  "PARSE_PROFILE",
  "COALESCE",
] as const;

export const ALLOWED_TRANSFORMS = [
  "TRIM",
  "COLLAPSE_WHITESPACE",
  "NORMALIZE_TEXT_CASE",
  "PARSE_INTEGER",
  "PARSE_DECIMAL",
  "PARSE_MEASUREMENT",
  "PARSE_MASS",
  "NORMALIZE_UNIT",
  "NORMALIZE_PART_IDENTIFIER",
  "NORMALIZE_MATERIAL",
  "NORMALIZE_PROFILE",
  "FILL_DOWN",
  "REPLACE_EMPTY_WITH_NULL",
] as const;

export type PlannerInputPayload = {
  schemaVersion: "workbook-planner-input/v1";
  profile: WorkbookProfile;
  targetSchema: OmegaWorkbookTargetField[];
  allowedOperations: readonly string[];
  allowedTransforms: readonly string[];
  sheets: Array<{
    sheetId: string;
    sheetName: string;
    columnStatistics: ReturnType<typeof buildColumnStatistics>;
    representativeCells: Array<{
      rowNumber: number;
      address: string;
      text: string;
      formula: string | null;
    }>;
    summarizedBecause?: string;
  }>;
  limitsApplied: string[];
  truncated: boolean;
};

export function buildPlannerInput(args: {
  snapshot: WorkbookSnapshot;
  profile: WorkbookProfile;
}): PlannerInputPayload {
  const limitsApplied: string[] = [];
  let truncated = false;

  const sheets: PlannerInputPayload["sheets"] = [];

  for (const sp of args.profile.sheets) {
    const sheet = args.snapshot.sheets.find((s) => s.sheetName === sp.sheetName);
    if (!sheet) continue;

    const columnStatistics = buildColumnStatistics(sheet);
    const repRows = new Set(sp.representativeRows.map((r) => r.rowNumber));
    for (const a of sp.anomalies) repRows.add(a.rowNumber);

    const representativeCells: PlannerInputPayload["sheets"][0]["representativeCells"] =
      [];
    for (const cell of sheet.cells) {
      if (!repRows.has(cell.rowNumber)) continue;
      const text = cellText(cell.rawValue, cell.formattedText).trim();
      if (!text && !cell.formula) continue;
      representativeCells.push({
        rowNumber: cell.rowNumber,
        address: cell.cellAddress,
        text: text.slice(0, 240),
        formula: cell.formula,
      });
    }

    let summarizedBecause: string | undefined;
    if (representativeCells.length > 400) {
      truncated = true;
      summarizedBecause = "REPRESENTATIVE_CELL_CAP";
      limitsApplied.push(`${sp.sheetName}:REPRESENTATIVE_CELL_CAP`);
      representativeCells.length = 400;
    }

    sheets.push({
      sheetId: sp.sheetId,
      sheetName: sp.sheetName,
      columnStatistics,
      representativeCells,
      summarizedBecause,
    });
  }

  if (args.snapshot.sheets.length > args.profile.sheets.length) {
    truncated = true;
    limitsApplied.push("SHEET_COUNT_CAP");
  }

  const payload: PlannerInputPayload = {
    schemaVersion: "workbook-planner-input/v1",
    profile: args.profile,
    targetSchema: OMEGA_TARGET_SCHEMA,
    allowedOperations: ALLOWED_OPERATIONS,
    allowedTransforms: ALLOWED_TRANSFORMS,
    sheets,
    limitsApplied,
    truncated,
  };

  const json = JSON.stringify(payload);
  if (json.length > INTERPRETER_LIMITS.maxPlannerInputChars) {
    // Drop anomaly-heavy sheets' cell detail first
    for (const s of payload.sheets) {
      if (JSON.stringify(payload).length <= INTERPRETER_LIMITS.maxPlannerInputChars) {
        break;
      }
      s.representativeCells = s.representativeCells.slice(0, 80);
      s.summarizedBecause = "PLANNER_INPUT_CHAR_CAP";
      truncated = true;
      limitsApplied.push(`${s.sheetName}:PLANNER_INPUT_CHAR_CAP`);
    }
  }

  return payload;
}
