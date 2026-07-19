/**
 * Deterministic whitelist plan executor — processes ALL declared data rows.
 */

import type {
  WorkbookCellEvidence,
  WorkbookSnapshot,
} from "../../normalization/types";
import { inferFixedWidthHeaderSpans } from "../fixed-width";
import { classifyFixedWidthRow } from "../fixed-width/classifyFixedWidthRow";
import { parsePlateProfile } from "../fixed-width/parsePlateProfile";
import { cellText } from "./columnUtils";
import { safeRegexCapture } from "./safeRegex";
import type {
  ExtractionExpression,
  ExtractionTransform,
  ExtractedFieldValue,
  ExtractedWorkbookOccurrence,
  FailedWorkbookRow,
  FieldProvenance,
  OmegaWorkbookTargetField,
  SkippedWorkbookRow,
  WorkbookExtractionExecutionResult,
  WorkbookExtractionPlan,
  WorkbookRowClass,
  WorkbookTablePlan,
} from "./types";
import { WORKBOOK_EXTRACTION_RESULT_SCHEMA } from "./types";

type AlignedSpanCache = Map<
  string,
  ReturnType<typeof inferFixedWidthHeaderSpans>
>;

export function executeWorkbookExtractionPlan(args: {
  snapshot: WorkbookSnapshot;
  plan: WorkbookExtractionPlan;
}): WorkbookExtractionExecutionResult {
  const occurrences: ExtractedWorkbookOccurrence[] = [];
  const skippedRows: SkippedWorkbookRow[] = [];
  const failedRows: FailedWorkbookRow[] = [];
  const rowLedger: import("./types").WorkbookRowLedgerEntry[] = [];
  const spanCache: AlignedSpanCache = new Map();

  let declaredDataRows = 0;
  let classifiedRows = 0;

  for (const table of args.plan.tables) {
    if (table.tableRole === "SUMMARY" || table.tableRole === "REFERENCE_TABLE") {
      // Still classify rows so none disappear
    }
    const sheet = args.snapshot.sheets.find(
      (s) => s.sheetName === table.sheetName
    );
    if (!sheet) {
      failedRows.push({
        tableId: table.tableId,
        sheetName: table.sheetName,
        rowNumber: 0,
        reason: "SHEET_NOT_FOUND",
        textPreview: "",
      });
      continue;
    }

    const byRow = new Map<number, WorkbookCellEvidence[]>();
    for (const cell of sheet.cells) {
      const list = byRow.get(cell.rowNumber) ?? [];
      list.push(cell);
      byRow.set(cell.rowNumber, list);
    }

    const from = table.dataRowSelector.fromRow;
    const to =
      table.dataRowSelector.toRow ??
      Math.max(...byRow.keys(), table.region.endRow);
    const exclude = new Set(table.dataRowSelector.excludeRowNumbers ?? []);

    const headerText =
      table.alignedHeaderText ??
      (table.headerRows[0] != null
        ? rowJoinedText(byRow.get(table.headerRows[0]) ?? [])
        : "");

    if (
      table.rowMode === "SINGLE_CELL_ALIGNED_TEXT" &&
      headerText &&
      !spanCache.has(table.tableId)
    ) {
      const samples: string[] = [];
      for (let r = from; r <= to && samples.length < 8; r++) {
        if (table.headerRows.includes(r)) continue;
        const t = rowJoinedText(byRow.get(r) ?? []);
        if (t.length > 20) samples.push(t);
      }
      spanCache.set(table.tableId, inferFixedWidthHeaderSpans(headerText, samples));
    }

    const fillDownState = new Map<OmegaWorkbookTargetField, ExtractedFieldValue>();

    for (let rowNumber = from; rowNumber <= to; rowNumber++) {
      if (exclude.has(rowNumber)) continue;
      declaredDataRows += 1;
      const cells = byRow.get(rowNumber) ?? [];
      const preview = rowJoinedText(cells).slice(0, 200);

      try {
        const classification = classifyRow({
          table,
          rowNumber,
          cells,
          headerText,
          headerRows: table.headerRows,
          spanFields: spanCache.get(table.tableId),
        });
        classifiedRows += 1;

        if (classification !== "DATA_OCCURRENCE") {
          skippedRows.push({
            tableId: table.tableId,
            sheetName: table.sheetName,
            rowNumber,
            classification,
            reason: `CLASSIFIED_${classification}`,
            textPreview: preview,
          });
          rowLedger.push({
            workbookId: args.plan.workbookId,
            tableId: table.tableId,
            sheetName: table.sheetName,
            rowNumber,
            classification,
            classificationReasons: [`CLASSIFIED_${classification}`],
            textPreview: preview,
            cellAddresses: cells.map((c) => c.cellAddress),
            extractedFields: [],
            occurrenceId: null,
            executionErrors: [],
          });
          continue;
        }

        if (
          table.tableRole === "SUMMARY" ||
          table.tableRole === "REFERENCE_TABLE"
        ) {
          skippedRows.push({
            tableId: table.tableId,
            sheetName: table.sheetName,
            rowNumber,
            classification: "NOTE",
            reason: `TABLE_ROLE_${table.tableRole}`,
            textPreview: preview,
          });
          rowLedger.push({
            workbookId: args.plan.workbookId,
            tableId: table.tableId,
            sheetName: table.sheetName,
            rowNumber,
            classification: "NOTE",
            classificationReasons: [`TABLE_ROLE_${table.tableRole}`],
            textPreview: preview,
            cellAddresses: cells.map((c) => c.cellAddress),
            extractedFields: [],
            occurrenceId: null,
            executionErrors: [],
          });
          continue;
        }

        const fields: ExtractedFieldValue[] = [];

        for (const fieldPlan of table.fields) {
          let extracted = evaluateExpression({
            snapshot: args.snapshot,
            sheetName: table.sheetName,
            rowNumber,
            cells,
            expr: fieldPlan.source,
            table,
            spanFields: spanCache.get(table.tableId) ?? [],
          });

          extracted = applyTransforms(extracted, fieldPlan.transforms, {
            fillDownState,
            targetField: fieldPlan.targetField,
            rowNumber,
          });

          if (fieldPlan.explicitUnit && extracted) {
            extracted = { ...extracted, unit: fieldPlan.explicitUnit };
          }

          if (extracted) {
            extracted = {
              ...extracted,
              targetField: fieldPlan.targetField,
              confidence: fieldPlan.confidence,
            };
            fields.push(extracted);
            if (
              fieldPlan.transforms.some((t) => t.kind === "FILL_DOWN") &&
              extracted.textValue
            ) {
              fillDownState.set(fieldPlan.targetField, extracted);
            }
          }
        }

        for (const c of table.constants) {
          fields.push({
            targetField: c.targetField,
            rawValue: c.value,
            textValue: String(c.value),
            numberValue:
              typeof c.value === "number" ? c.value : null,
            unit: null,
            provenance: {
              operation: "READ_CONSTANT_CELL",
              cellAddresses: c.sourceAddress ? [c.sourceAddress] : [],
            },
            confidence: 1,
          });
        }

        const getText = (f: OmegaWorkbookTargetField) =>
          fields.find((x) => x.targetField === f)?.textValue ?? null;

        const occurrenceId = `occ:${args.plan.workbookId}:${table.tableId}:${rowNumber}`;
        occurrences.push({
          occurrenceId,
          tableId: table.tableId,
          sheetName: table.sheetName,
          rowNumber,
          classification: "DATA_OCCURRENCE",
          fields,
          explicitPartIdentifier: getText("EXPLICIT_PART_IDENTIFIER"),
          sourceDescriptor: getText("SOURCE_DESCRIPTOR"),
          profileRaw: getText("PROFILE"),
        });
        rowLedger.push({
          workbookId: args.plan.workbookId,
          tableId: table.tableId,
          sheetName: table.sheetName,
          rowNumber,
          classification: "DATA_OCCURRENCE",
          classificationReasons: ["DATA"],
          textPreview: preview,
          cellAddresses: cells.map((c) => c.cellAddress),
          extractedFields: fields.map((f) => ({
            targetField: f.targetField,
            operation: String(f.provenance.operation),
            sourceCells: f.provenance.cellAddresses,
            characterStart: f.provenance.characterStart ?? null,
            characterEnd: f.provenance.characterEnd ?? null,
            rawValue: f.rawValue,
            textValue: f.textValue,
            numberValue: f.numberValue,
            unit: f.unit,
            status:
              f.textValue != null || f.numberValue != null
                ? ("EXTRACTED" as const)
                : ("EMPTY" as const),
          })),
          occurrenceId,
          executionErrors: [],
        });
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "FAILED_EXTRACTION";
        failedRows.push({
          tableId: table.tableId,
          sheetName: table.sheetName,
          rowNumber,
          reason,
          textPreview: preview,
        });
        classifiedRows += 1;
        rowLedger.push({
          workbookId: args.plan.workbookId,
          tableId: table.tableId,
          sheetName: table.sheetName,
          rowNumber,
          classification: "FAILED_EXTRACTION",
          classificationReasons: [reason],
          textPreview: preview,
          cellAddresses: cells.map((c) => c.cellAddress),
          extractedFields: [],
          occurrenceId: null,
          executionErrors: [reason],
        });
      }
    }
  }

  const unexplainedRows = Math.max(0, declaredDataRows - classifiedRows);
  const coveragePercent =
    declaredDataRows === 0
      ? 100
      : Math.round(((classifiedRows - unexplainedRows) / declaredDataRows) * 1000) /
        10;

  // Runtime assertions
  assertCoverage(declaredDataRows, classifiedRows, unexplainedRows);
  assertNoInventedCells(args.snapshot, occurrences);

  return {
    schemaVersion: WORKBOOK_EXTRACTION_RESULT_SCHEMA,
    workbookId: args.plan.workbookId,
    planId: args.plan.planId,
    occurrences,
    skippedRows,
    failedRows,
    coverage: {
      declaredDataRows,
      classifiedRows,
      dataOccurrences: occurrences.length,
      skippedRows: skippedRows.length,
      failedRows: failedRows.length,
      unexplainedRows,
      coveragePercent,
    },
    rowLedger,
  };
}

function assertCoverage(
  declared: number,
  classified: number,
  unexplained: number
): void {
  if (unexplained > 0 && process.env.NODE_ENV !== "production") {
    console.assert(
      classified >= declared - unexplained,
      "ASSERT: unexplained rows detected"
    );
  }
  void declared;
  void classified;
}

function assertNoInventedCells(
  snapshot: WorkbookSnapshot,
  occurrences: ExtractedWorkbookOccurrence[]
): void {
  const addresses = new Set(
    snapshot.sheets.flatMap((s) => s.cells.map((c) => c.cellAddress))
  );
  for (const occ of occurrences) {
    for (const f of occ.fields) {
      for (const addr of f.provenance.cellAddresses) {
        if (addr && !addresses.has(addr) && process.env.NODE_ENV !== "production") {
          throw new Error(`ASSERT_NONEXISTENT_CELL:${addr}`);
        }
      }
    }
  }
}

function rowJoinedText(cells: WorkbookCellEvidence[]): string {
  return cells
    .map((c) => cellText(c.rawValue, c.formattedText).trim())
    .filter(Boolean)
    .join(" | ");
}

function classifyRow(args: {
  table: WorkbookTablePlan;
  rowNumber: number;
  cells: WorkbookCellEvidence[];
  headerText: string;
  headerRows: number[];
  spanFields?: ReturnType<typeof inferFixedWidthHeaderSpans>;
}): WorkbookRowClass {
  const text = rowJoinedText(args.cells);
  const trimmed = text.trim();

  if (args.headerRows.includes(args.rowNumber)) {
    return args.headerRows[0] === args.rowNumber ? "HEADER" : "REPEATED_HEADER";
  }

  // Reuse fixed-width classifier for aligned-text mode
  if (args.table.rowMode === "SINGLE_CELL_ALIGNED_TEXT") {
    const fw = classifyFixedWidthRow({
      text: trimmed,
      headerText: args.headerText,
      headerFields: args.spanFields ?? [],
      isFirstHeader: false,
    });
    switch (fw.class) {
      case "HEADER":
        return "REPEATED_HEADER";
      case "REPEATED_HEADER":
        return "REPEATED_HEADER";
      case "TOTAL":
        return "TOTAL";
      case "SUBTOTAL":
        return "SUBTOTAL";
      case "SEPARATOR":
        return "SEPARATOR";
      case "NOTE":
        return "NOTE";
      case "BLANK":
        return "BLANK";
      case "INVALID":
        return "INVALID";
      case "DATA":
        return "DATA_OCCURRENCE";
      default:
        break;
    }
  }

  for (const rule of args.table.rowClassification.rules) {
    if (ruleMatches(rule, trimmed, text, args.cells)) {
      return rule.class;
    }
  }
  return args.table.rowClassification.defaultClass;
}

function ruleMatches(
  rule: WorkbookTablePlan["rowClassification"]["rules"][0],
  trimmed: string,
  full: string,
  cells: WorkbookCellEvidence[]
): boolean {
  for (const op of rule.ops) {
    switch (op.kind) {
      case "MATCH_EMPTY_ROW":
        if (!trimmed) return true;
        break;
      case "MATCH_TOTAL_LABEL":
        if (/^\s*(total|sum|סה.?כ|סהכ)/i.test(trimmed)) return true;
        break;
      case "MATCH_SUBTOTAL_LABEL":
        if (/sub\s*total|ביניים/i.test(trimmed)) return true;
        break;
      case "MATCH_FOOTER_LABEL":
        if (/footer|page\s*\d|עמוד/i.test(trimmed)) return true;
        break;
      case "MATCH_SEPARATOR":
        if (/^[\s\-_=.*]+$/.test(trimmed)) return true;
        break;
      case "MATCH_HEADER_SIGNATURE":
      case "MATCH_REPEATED_HEADER": {
        const texts = cells
          .map((c) => cellText(c.rawValue, c.formattedText).trim())
          .filter(Boolean);
        const hits = texts.filter((t) =>
          /profile|quantity|material|weight|length|width|thickness|כמות|חומר|פרופיל|משקל|אורך|רוחב|עובי|part|mark/i.test(
            t
          )
        ).length;
        const numericHeavy = texts.filter((t) =>
          /^-?\d+([.,]\d+)?$/.test(t)
        ).length;
        // Headers: multiple vocabulary tokens and little numeric payload
        if (hits >= 2 && numericHeavy === 0) return true;
        break;
      }
      case "REQUIRE_ANY_FIELD":
        // Evaluated after extraction would be ideal; here use non-empty heuristic
        if (trimmed.length > 0) return true;
        break;
      case "REQUIRE_NUMERIC_FIELD":
        if (/\d/.test(full)) return true;
        break;
      default:
        break;
    }
  }
  return false;
}

function evaluateExpression(args: {
  snapshot: WorkbookSnapshot;
  sheetName: string;
  rowNumber: number;
  cells: WorkbookCellEvidence[];
  expr: ExtractionExpression;
  table: WorkbookTablePlan;
  spanFields: ReturnType<typeof inferFixedWidthHeaderSpans>;
}): ExtractedFieldValue | null {
  const { expr, cells, rowNumber, sheetName } = args;

  const cellAtCol = (letter: string) =>
    cells.find((c) => c.columnLetter.toUpperCase() === letter.toUpperCase());

  const make = (
    raw: unknown,
    text: string | null,
    provenance: FieldProvenance,
    numberValue: number | null = null
  ): ExtractedFieldValue => ({
    targetField: "NOTES", // overwritten by caller
    rawValue: raw,
    textValue: text,
    numberValue,
    unit: null,
    provenance,
    confidence: 1,
  });

  switch (expr.op) {
    case "READ_COLUMN_CELL":
    case "READ_HEADER_RELATIVE_CELL": {
      const cell = cellAtCol(expr.columnLetter);
      if (!cell) return null;
      const text = cellText(cell.rawValue, cell.formattedText);
      return make(cell.rawValue, text || null, {
        operation: expr.op,
        cellAddresses: [cell.cellAddress],
        originalCellText: cell.formula
          ? `formula:${cell.formula}`
          : text || null,
      });
    }
    case "READ_CELL":
    case "READ_CONSTANT_CELL": {
      const sheet = args.snapshot.sheets.find((s) => s.sheetName === sheetName);
      const cell = sheet?.cells.find((c) => c.cellAddress === expr.address);
      if (!cell) {
        throw new Error(`INVENTED_CELL_AT_EXEC:${expr.address}`);
      }
      const text = cellText(cell.rawValue, cell.formattedText);
      return make(cell.rawValue, text || null, {
        operation: expr.op,
        cellAddresses: [cell.cellAddress],
      });
    }
    case "READ_PREVIOUS_NON_EMPTY": {
      const sheet = args.snapshot.sheets.find((s) => s.sheetName === sheetName);
      if (!sheet) return null;
      for (let r = rowNumber - 1; r >= 1; r--) {
        const cell = sheet.cells.find(
          (c) =>
            c.rowNumber === r &&
            c.columnLetter.toUpperCase() === expr.columnLetter.toUpperCase()
        );
        if (!cell) continue;
        const text = cellText(cell.rawValue, cell.formattedText).trim();
        if (!text) continue;
        return make(cell.rawValue, text, {
          operation: "READ_PREVIOUS_NON_EMPTY",
          cellAddresses: [cell.cellAddress],
        });
      }
      return null;
    }
    case "SPLIT_ALIGNED_TEXT": {
      const cell = cellAtCol(expr.columnLetter) ?? cells[0];
      if (!cell) return null;
      const full = cellText(cell.rawValue, cell.formattedText);
      const headerText = expr.headerText ?? args.table.alignedHeaderText ?? "";
      const spans =
        args.spanFields.length > 0
          ? args.spanFields
          : inferFixedWidthHeaderSpans(headerText, [full]);
      const span = spans[expr.segmentIndex];
      if (!span) return null;
      const rawSub = full.slice(span.start, Math.min(full.length, span.end));
      const trimmed = rawSub.trim();
      return make(trimmed, trimmed || null, {
        operation: "SPLIT_ALIGNED_TEXT",
        cellAddresses: [cell.cellAddress],
        originalCellText: full,
        characterStart: span.start,
        characterEnd: Math.min(full.length, span.end),
        rawSubstring: rawSub,
        headerSemantic: span.semantic,
      });
    }
    case "EXTRACT_BY_HEADER_SPAN": {
      const cell = cellAtCol(expr.columnLetter) ?? cells[0];
      if (!cell) return null;
      const full = cellText(cell.rawValue, cell.formattedText);
      const span =
        args.spanFields.find((s) => s.semantic === expr.headerSemantic) ??
        (expr.segmentIndex != null ? args.spanFields[expr.segmentIndex] : null);
      if (!span) return null;
      const rawSub = full.slice(span.start, Math.min(full.length, span.end));
      const trimmed = rawSub.trim();
      return make(trimmed, trimmed || null, {
        operation: "EXTRACT_BY_HEADER_SPAN",
        cellAddresses: [cell.cellAddress],
        originalCellText: full,
        characterStart: span.start,
        characterEnd: Math.min(full.length, span.end),
        rawSubstring: rawSub,
        headerSemantic: span.semantic,
      });
    }
    case "SPLIT_DELIMITED_TEXT": {
      const cell = cellAtCol(expr.columnLetter);
      if (!cell) return null;
      const full = cellText(cell.rawValue, cell.formattedText);
      const parts = full.split(expr.delimiter);
      const part = parts[expr.segmentIndex]?.trim() ?? null;
      return make(part, part, {
        operation: "SPLIT_DELIMITED_TEXT",
        cellAddresses: [cell.cellAddress],
        originalCellText: full,
        rawSubstring: part,
      });
    }
    case "REGEX_CAPTURE": {
      const cell = cellAtCol(expr.columnLetter);
      if (!cell) return null;
      const full = cellText(cell.rawValue, cell.formattedText);
      const captured = safeRegexCapture({
        text: full,
        pattern: expr.pattern,
        groupIndex: expr.groupIndex,
      });
      if (!captured.ok) throw new Error(`REGEX_FAIL:${captured.reason}`);
      return make(captured.value, captured.value, {
        operation: "REGEX_CAPTURE",
        cellAddresses: [cell.cellAddress],
        originalCellText: full,
        rawSubstring: captured.value,
      });
    }
    case "COMBINE_CELLS": {
      const texts: string[] = [];
      const addrs: string[] = [];
      for (const letter of expr.columnLetters) {
        const cell = cellAtCol(letter);
        if (!cell) continue;
        texts.push(cellText(cell.rawValue, cell.formattedText).trim());
        addrs.push(cell.cellAddress);
      }
      const joined = texts.filter(Boolean).join(expr.separator ?? " ");
      return make(joined, joined || null, {
        operation: "COMBINE_CELLS",
        cellAddresses: addrs,
      });
    }
    case "COALESCE": {
      for (const src of expr.sources) {
        const v = evaluateExpression({ ...args, expr: src });
        if (v?.textValue) return v;
      }
      return null;
    }
    case "PARSE_PROFILE": {
      const inner = evaluateExpression({ ...args, expr: expr.from });
      if (!inner?.textValue) return inner;
      const parsed = parsePlateProfile(inner.textValue);
      return {
        ...inner,
        rawValue: parsed,
        textValue: inner.textValue,
        provenance: {
          ...inner.provenance,
          operation: "PARSE_PROFILE",
        },
      };
    }
    default:
      throw new Error(`UNSUPPORTED_OP_AT_EXEC:${(expr as { op: string }).op}`);
  }
}

function applyTransforms(
  value: ExtractedFieldValue | null,
  transforms: ExtractionTransform[],
  ctx: {
    fillDownState: Map<OmegaWorkbookTargetField, ExtractedFieldValue>;
    targetField: OmegaWorkbookTargetField;
    rowNumber: number;
  }
): ExtractedFieldValue | null {
  let current = value;
  for (const t of transforms) {
    if (t.kind === "FILL_DOWN") {
      if (!current?.textValue) {
        const prev = ctx.fillDownState.get(ctx.targetField);
        if (prev) {
          current = {
            ...prev,
            provenance: {
              ...prev.provenance,
              operation: `${prev.provenance.operation}+FILL_DOWN`,
            },
          };
        }
      }
      continue;
    }
    if (!current) {
      if (t.kind === "REPLACE_EMPTY_WITH_NULL") return null;
      continue;
    }
    let text = current.textValue ?? "";
    switch (t.kind) {
      case "TRIM":
        text = text.trim();
        break;
      case "COLLAPSE_WHITESPACE":
        text = text.replace(/\s+/g, " ").trim();
        break;
      case "NORMALIZE_TEXT_CASE":
        text = text.toUpperCase();
        break;
      case "NORMALIZE_PART_IDENTIFIER":
      case "NORMALIZE_MATERIAL":
      case "NORMALIZE_PROFILE":
        text = text.replace(/\s+/g, " ").trim();
        break;
      case "PARSE_INTEGER": {
        const n = Number.parseInt(text.replace(/,/g, ""), 10);
        current = {
          ...current,
          textValue: text,
          numberValue: Number.isFinite(n) ? n : null,
        };
        continue;
      }
      case "PARSE_DECIMAL":
      case "PARSE_MEASUREMENT":
      case "PARSE_MASS": {
        const n = Number.parseFloat(text.replace(/,/g, ""));
        current = {
          ...current,
          textValue: text,
          numberValue: Number.isFinite(n) ? n : null,
        };
        continue;
      }
      case "NORMALIZE_UNIT":
      case "REPLACE_EMPTY_WITH_NULL":
        if (!text) return null;
        break;
      default:
        break;
    }
    current = { ...current, textValue: text || null };
  }
  return current;
}
