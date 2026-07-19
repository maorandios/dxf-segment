/**
 * Deterministic fast-path: emit a valid WorkbookExtractionPlan when structure
 * is unambiguous (ordinary grid or fixed-width aligned text).
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { detectFixedWidthTablesInSnapshot } from "../fixed-width";
import { cellText, columnLetterToNumber } from "./columnUtils";
import {
  detectExplicitUnitFromHeader,
  mapHeaderToTargetField,
} from "./headerVocabulary";
import { resolveFieldPlanExplicitUnit } from "./unitEvidence";
import type {
  WorkbookExtractionPlan,
  WorkbookFieldPlan,
  WorkbookProfile,
  WorkbookTablePlan,
} from "./types";
import { WORKBOOK_EXTRACTION_PLAN_SCHEMA } from "./types";

export function tryBuildDeterministicFastPathPlan(args: {
  snapshot: WorkbookSnapshot;
  profile: WorkbookProfile;
}): WorkbookExtractionPlan | null {
  // Prefer fixed-width when detection is confident
  const fw = detectFixedWidthTablesInSnapshot(args.snapshot);
  const strongFw = fw.filter((d) => d.detected && d.confidence >= 0.75);
  if (strongFw.length > 0) {
    return buildAlignedTextPlan(args.snapshot, args.profile, strongFw);
  }

  const grid = tryBuildOrdinaryGridPlan(args.snapshot, args.profile);
  if (grid && grid.confidence >= 0.75) return grid;

  return null;
}

function buildAlignedTextPlan(
  snapshot: WorkbookSnapshot,
  profile: WorkbookProfile,
  detections: ReturnType<typeof detectFixedWidthTablesInSnapshot>
): WorkbookExtractionPlan {
  const tables: WorkbookTablePlan[] = [];

  for (const d of detections) {
    if (
      !d.detected ||
      !d.headerRowNumber ||
      !d.sourceColumnLetter ||
      !d.headerText
    ) {
      continue;
    }
    const sheetProfile = profile.sheets.find(
      (s) => s.sheetName === d.sheetName
    );
    const sheetId = sheetProfile?.sheetId ?? `sheet:${d.sheetName}`;
    const dataEnd =
      d.candidateDataRows.length > 0
        ? Math.max(...d.candidateDataRows)
        : d.headerRowNumber + 1;
    const region =
      sheetProfile?.regions[0] ??
      ({
        startRow: d.headerRowNumber,
        endRow: dataEnd,
        startColumnLetter: d.sourceColumnLetter,
        endColumnLetter: d.sourceColumnLetter,
      } as const);

    const fields: WorkbookFieldPlan[] = [];
    for (const h of d.headerFields) {
      const target = mapFixedWidthSemanticToTarget(h.semantic);
      if (!target) continue;
      const unit =
        target === "UNIT_WEIGHT" || target === "TOTAL_WEIGHT"
          ? resolveFieldPlanExplicitUnit({
              governingHeaderText: h.rawHeader,
              targetField: target,
            })
          : target === "LENGTH" ||
              target === "WIDTH" ||
              target === "THICKNESS"
            ? resolveFieldPlanExplicitUnit({
                governingHeaderText: h.rawHeader,
                targetField: target,
              }) ?? "MM"
            : resolveFieldPlanExplicitUnit({
                governingHeaderText: h.rawHeader,
                targetField: target,
                dropIncompatible: true,
              });

      fields.push({
        targetField: target,
        source: {
          op: "SPLIT_ALIGNED_TEXT",
          columnLetter: d.sourceColumnLetter,
          segmentIndex: h.index,
          headerText: d.headerText,
        },
        transforms: [
          { kind: "TRIM" },
          { kind: "COLLAPSE_WHITESPACE" },
          ...(target === "QUANTITY"
            ? [{ kind: "PARSE_INTEGER" as const }]
            : target === "LENGTH" ||
                target === "WIDTH" ||
                target === "THICKNESS" ||
                target === "UNIT_WEIGHT" ||
                target === "TOTAL_WEIGHT"
              ? [{ kind: "PARSE_DECIMAL" as const }]
              : target === "PROFILE"
                ? [{ kind: "NORMALIZE_PROFILE" as const }]
                : target === "MATERIAL"
                  ? [{ kind: "NORMALIZE_MATERIAL" as const }]
                  : target === "EXPLICIT_PART_IDENTIFIER"
                    ? [{ kind: "NORMALIZE_PART_IDENTIFIER" as const }]
                    : []),
        ],
        expectedType:
          target === "QUANTITY"
            ? "INTEGER"
            : target === "UNIT_WEIGHT" || target === "TOTAL_WEIGHT"
              ? "MASS"
              : target === "LENGTH" ||
                  target === "WIDTH" ||
                  target === "THICKNESS"
                ? "MEASUREMENT"
                : "TEXT",
        explicitUnit: unit,
        aggregationSemantic:
          target === "UNIT_WEIGHT"
            ? "PER_ITEM"
            : target === "TOTAL_WEIGHT"
              ? "TOTAL"
              : null,
        required: target === "QUANTITY",
        confidence: h.confidence,
        reasons: [`HEADER_SEMANTIC:${h.semantic}`, `RAW_HEADER:${h.rawHeader}`],
      });
    }

    // Ensure PROFILE can drive plate parse via transform path
    if (
      fields.some((f) => f.targetField === "PROFILE") &&
      !fields.some((f) => f.targetField === "THICKNESS")
    ) {
      // Thickness/width derived later from profile parse in occurrence adapter
    }

    const endRow = Math.max(dataEnd, region.endRow ?? dataEnd);

    tables.push({
      tableId: `fw:${d.sheetName}:${d.headerRowNumber}`,
      sheetId,
      sheetName: d.sheetName,
      region: {
        startRow: Math.min(d.headerRowNumber, region.startRow),
        endRow,
        startColumn: columnLetterToNumber(d.sourceColumnLetter),
        endColumn: columnLetterToNumber(d.sourceColumnLetter),
      },
      tableRole: "MATERIAL_LIST",
      rowMode: "SINGLE_CELL_ALIGNED_TEXT",
      headerRows: [d.headerRowNumber],
      dataRowSelector: {
        fromRow: d.headerRowNumber,
        toRow: endRow,
        excludeRowNumbers: [],
      },
      fields,
      rowClassification: {
        rules: [
          { class: "BLANK", ops: [{ kind: "MATCH_EMPTY_ROW" }] },
          { class: "HEADER", ops: [{ kind: "MATCH_HEADER_SIGNATURE" }] },
          { class: "REPEATED_HEADER", ops: [{ kind: "MATCH_REPEATED_HEADER" }] },
          { class: "TOTAL", ops: [{ kind: "MATCH_TOTAL_LABEL" }] },
          { class: "SUBTOTAL", ops: [{ kind: "MATCH_SUBTOTAL_LABEL" }] },
          { class: "FOOTER", ops: [{ kind: "MATCH_FOOTER_LABEL" }] },
          { class: "SEPARATOR", ops: [{ kind: "MATCH_SEPARATOR" }] },
          {
            class: "DATA_OCCURRENCE",
            ops: [
              {
                kind: "REQUIRE_ANY_FIELD",
                fields: [
                  "PROFILE",
                  "MATERIAL",
                  "QUANTITY",
                  "EXPLICIT_PART_IDENTIFIER",
                ],
              },
            ],
          },
        ],
        defaultClass: "NOTE",
      },
      constants: [],
      alignedHeaderText: d.headerText,
      confidence: d.confidence,
      reasons: ["DETERMINISTIC_FIXED_WIDTH_DETECTION", ...d.reasons],
    });
  }

  const confidence =
    tables.length === 0
      ? 0
      : tables.reduce((s, t) => s + t.confidence, 0) / tables.length;

  return {
    schemaVersion: WORKBOOK_EXTRACTION_PLAN_SCHEMA,
    workbookId: snapshot.documentId,
    planId: `plan:fast:fw:${profile.fingerprint}`,
    confidence,
    status: confidence >= 0.75 ? "READY" : "READY_WITH_WARNINGS",
    workbookSummary: "Deterministic fixed-width / aligned-text plan",
    tables,
    relationships: [],
    ambiguities: [],
    warnings: [],
    planSource: "DETERMINISTIC_FAST_PATH",
  };
}

function mapFixedWidthSemanticToTarget(
  semantic: string
): WorkbookFieldPlan["targetField"] | null {
  switch (semantic) {
    case "PART_IDENTIFIER":
      return "EXPLICIT_PART_IDENTIFIER";
    case "PROFILE_OR_SIZE":
      return "PROFILE";
    case "MATERIAL":
      return "MATERIAL";
    case "QUANTITY":
      return "QUANTITY";
    case "LENGTH":
      return "LENGTH";
    case "WIDTH":
      return "WIDTH";
    case "THICKNESS":
      return "THICKNESS";
    case "WEIGHT":
      return "UNIT_WEIGHT";
    default:
      return null;
  }
}

function tryBuildOrdinaryGridPlan(
  snapshot: WorkbookSnapshot,
  profile: WorkbookProfile
): WorkbookExtractionPlan | null {
  const tables: WorkbookTablePlan[] = [];

  for (const sp of profile.sheets) {
    const sheet = snapshot.sheets.find((s) => s.sheetName === sp.sheetName);
    if (!sheet) continue;
    if (sp.regions.some((r) => r.singleCellTextHeavy)) continue;

    const header = sp.candidateHeaderRows[0];
    if (!header || header.confidence < 0.4) continue;

    const headerCells = sheet.cells.filter((c) => c.rowNumber === header.rowNumber);
    if (headerCells.length < 2) continue;

    const fields: WorkbookFieldPlan[] = [];
    const seen = new Set<string>();

    for (const cell of headerCells) {
      const text = cellText(cell.rawValue, cell.formattedText).trim();
      if (!text) continue;
      const target = mapHeaderToTargetField(text);
      if (!target || seen.has(target)) continue;
      // Never map PROFILE heading to part id
      if (
        target === "EXPLICIT_PART_IDENTIFIER" &&
        /profile|פרופיל|plate/i.test(text)
      ) {
        continue;
      }
      seen.add(target);
      const unit = detectExplicitUnitFromHeader(text);
      fields.push({
        targetField: target,
        source: {
          op: "READ_COLUMN_CELL",
          columnLetter: cell.columnLetter,
        },
        transforms: [
          { kind: "TRIM" },
          ...(target === "QUANTITY"
            ? [{ kind: "PARSE_INTEGER" as const }]
            : target === "LENGTH" ||
                target === "WIDTH" ||
                target === "THICKNESS" ||
                target === "AREA" ||
                target === "UNIT_WEIGHT" ||
                target === "TOTAL_WEIGHT"
              ? [{ kind: "PARSE_DECIMAL" as const }]
              : []),
        ],
        expectedType:
          target === "QUANTITY"
            ? "INTEGER"
            : target === "UNIT_WEIGHT" || target === "TOTAL_WEIGHT"
              ? "MASS"
              : target === "LENGTH" ||
                  target === "WIDTH" ||
                  target === "THICKNESS" ||
                  target === "AREA"
                ? "MEASUREMENT"
                : "TEXT",
        explicitUnit: unit,
        aggregationSemantic:
          target === "UNIT_WEIGHT"
            ? "PER_ITEM"
            : target === "TOTAL_WEIGHT"
              ? "TOTAL"
              : null,
        required: target === "QUANTITY" || target === "MATERIAL",
        confidence: header.confidence,
        reasons: [`HEADER:${text}`],
      });
    }

    if (fields.length < 2) continue;
    if (
      !fields.some(
        (f) =>
          f.targetField === "QUANTITY" ||
          f.targetField === "PROFILE" ||
          f.targetField === "EXPLICIT_PART_IDENTIFIER" ||
          f.targetField === "MATERIAL"
      )
    ) {
      continue;
    }

    const region = sp.regions[0];
    const maxRow =
      region?.endRow ??
      Math.max(...sheet.cells.map((c) => c.rowNumber), header.rowNumber + 1);

    tables.push({
      tableId: `grid:${sp.sheetName}:${header.rowNumber}`,
      sheetId: sp.sheetId,
      sheetName: sp.sheetName,
      region: {
        startRow: region?.startRow ?? header.rowNumber,
        endRow: maxRow,
        startColumn: columnLetterToNumber(region?.startColumnLetter ?? "A"),
        endColumn: columnLetterToNumber(region?.endColumnLetter ?? "Z"),
      },
      tableRole: "PART_LIST",
      rowMode: "CELL_GRID",
      headerRows: [header.rowNumber],
      dataRowSelector: {
        fromRow: header.rowNumber + 1,
        toRow: maxRow,
        excludeRowNumbers: [],
      },
      fields,
      rowClassification: {
        rules: [
          { class: "BLANK", ops: [{ kind: "MATCH_EMPTY_ROW" }] },
          { class: "HEADER", ops: [{ kind: "MATCH_HEADER_SIGNATURE" }] },
          { class: "REPEATED_HEADER", ops: [{ kind: "MATCH_REPEATED_HEADER" }] },
          { class: "TOTAL", ops: [{ kind: "MATCH_TOTAL_LABEL" }] },
          { class: "SUBTOTAL", ops: [{ kind: "MATCH_SUBTOTAL_LABEL" }] },
          { class: "FOOTER", ops: [{ kind: "MATCH_FOOTER_LABEL" }] },
          {
            class: "DATA_OCCURRENCE",
            ops: [
              {
                kind: "REQUIRE_ANY_FIELD",
                fields: fields.map((f) => f.targetField),
              },
            ],
          },
        ],
        defaultClass: "NOTE",
      },
      constants: [],
      alignedHeaderText: null,
      confidence: Math.min(0.95, 0.62 + fields.length * 0.08),
      reasons: ["DETERMINISTIC_ORDINARY_GRID", `HEADER_ROW:${header.rowNumber}`],
    });
  }

  if (tables.length === 0) return null;

  const confidence =
    tables.reduce((s, t) => s + t.confidence, 0) / tables.length;

  return {
    schemaVersion: WORKBOOK_EXTRACTION_PLAN_SCHEMA,
    workbookId: snapshot.documentId,
    planId: `plan:fast:grid:${profile.fingerprint}`,
    confidence,
    status: confidence >= 0.75 ? "READY" : "READY_WITH_WARNINGS",
    workbookSummary: "Deterministic ordinary multi-column grid plan",
    tables,
    relationships: [],
    ambiguities: [],
    warnings: [],
    planSource: "DETERMINISTIC_FAST_PATH",
  };
}
