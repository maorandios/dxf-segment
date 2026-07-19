/**
 * Zod schema for workbook-extraction-plan/v1 (structured AI output).
 */

import { z } from "zod";

const targetFieldSchema = z.enum([
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
]);

const unitSchema = z
  .enum(["MM", "CM", "M", "MM2", "CM2", "M2", "G", "KG", "TON"])
  .nullable();

const transformSchema = z.object({
  kind: z.enum([
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
  ]),
  args: z.record(z.string(), z.unknown()).nullable(),
});

/** Flat expression object — OpenAI structured output friendly (no deep recursion). */
const expressionSchema = z.object({
  op: z.enum([
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
  ]),
  columnLetter: z.string().nullable(),
  address: z.string().nullable(),
  segmentIndex: z.number().int().nullable(),
  delimiter: z.string().nullable(),
  pattern: z.string().nullable(),
  groupIndex: z.number().int().nullable(),
  headerText: z.string().nullable(),
  headerSemantic: z.string().nullable(),
  columnLetters: z.array(z.string()).nullable(),
  separator: z.string().nullable(),
  /** For COALESCE / PARSE_PROFILE — nested ops as flat sibling list is avoided;
   *  use columnLetter for primary source. Nested coalesce sources as JSON string. */
  coalesceColumnLetters: z.array(z.string()).nullable(),
});

const fieldPlanSchema = z.object({
  targetField: targetFieldSchema,
  source: expressionSchema,
  transforms: z.array(transformSchema),
  expectedType: z.enum([
    "TEXT",
    "INTEGER",
    "DECIMAL",
    "MEASUREMENT",
    "MASS",
    "BOOLEAN",
  ]),
  explicitUnit: unitSchema,
  aggregationSemantic: z
    .enum(["PER_ITEM", "TOTAL", "UNKNOWN"])
    .nullable(),
  required: z.boolean(),
  confidence: z.number(),
  reasons: z.array(z.string()),
});

const rowClassSchema = z.enum([
  "DATA_OCCURRENCE",
  "HEADER",
  "REPEATED_HEADER",
  "TOTAL",
  "SUBTOTAL",
  "FOOTER",
  "NOTE",
  "SEPARATOR",
  "BLANK",
  "INVALID",
  "FAILED_EXTRACTION",
]);

const classificationOpSchema = z.object({
  kind: z.enum([
    "MATCH_EMPTY_ROW",
    "MATCH_HEADER_SIGNATURE",
    "MATCH_REPEATED_HEADER",
    "MATCH_TOTAL_LABEL",
    "MATCH_SUBTOTAL_LABEL",
    "MATCH_FOOTER_LABEL",
    "MATCH_SEPARATOR",
    "REQUIRE_NUMERIC_FIELD",
    "REQUIRE_ANY_FIELD",
    "REQUIRE_FIELD_PATTERN",
  ]),
  tokens: z.array(z.string()).nullable(),
  field: targetFieldSchema.nullable(),
  fields: z.array(targetFieldSchema).nullable(),
});

const tablePlanSchema = z.object({
  tableId: z.string().min(1),
  sheetId: z.string().min(1),
  sheetName: z.string().min(1),
  region: z.object({
    startRow: z.number().int(),
    endRow: z.number().int(),
    startColumn: z.number().int(),
    endColumn: z.number().int(),
  }),
  tableRole: z.enum([
    "PART_LIST",
    "MATERIAL_LIST",
    "QUANTITY_LIST",
    "REFERENCE_TABLE",
    "SUMMARY",
    "UNKNOWN",
  ]),
  rowMode: z.enum([
    "CELL_GRID",
    "SINGLE_CELL_ALIGNED_TEXT",
    "DELIMITED_TEXT",
    "KEY_VALUE_BLOCK",
    "MULTI_ROW_RECORD",
  ]),
  headerRows: z.array(z.number().int()),
  dataRowSelector: z.object({
    fromRow: z.number().int(),
    toRow: z.number().int().nullable(),
    excludeRowNumbers: z.array(z.number().int()).nullable(),
  }),
  fields: z.array(fieldPlanSchema),
  rowClassification: z.object({
    rules: z.array(
      z.object({
        class: rowClassSchema,
        ops: z.array(classificationOpSchema),
      })
    ),
    defaultClass: rowClassSchema,
  }),
  constants: z.array(
    z.object({
      targetField: targetFieldSchema,
      value: z.union([z.string(), z.number(), z.boolean()]),
      sourceAddress: z.string().nullable(),
    })
  ),
  alignedHeaderText: z.string().nullable(),
  confidence: z.number(),
  reasons: z.array(z.string()),
});

export const aiWorkbookExtractionPlanSchema = z.object({
  schemaVersion: z.literal("workbook-extraction-plan/v1"),
  workbookId: z.string(),
  confidence: z.number(),
  status: z.enum([
    "READY",
    "READY_WITH_WARNINGS",
    "MAPPING_REQUIRED",
    "UNSUPPORTED",
  ]),
  workbookSummary: z.string(),
  tables: z.array(tablePlanSchema),
  relationships: z.array(
    z.object({
      relationshipId: z.string(),
      type: z.enum([
        "JOIN_BY_EXPLICIT_PART_IDENTIFIER",
        "LOOKUP_BY_NORMALIZED_KEY",
        "APPLY_TABLE_CONSTANTS",
        "MERGE_COMPLEMENTARY_FIELDS",
      ]),
      leftTableId: z.string(),
      rightTableId: z.string(),
      leftKeyField: targetFieldSchema.nullable(),
      rightKeyField: targetFieldSchema.nullable(),
      cardinality: z.enum(["ONE_TO_ONE", "MANY_TO_ONE", "ONE_TO_MANY"]),
      conflictPolicy: z.enum([
        "PRESERVE_CONFLICT",
        "PREFER_EXPLICIT",
        "REQUIRE_REVIEW",
      ]),
      confidence: z.number(),
    })
  ),
  ambiguities: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      sheetName: z.string().nullable(),
      tableId: z.string().nullable(),
    })
  ),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
    })
  ),
});

export type AiWorkbookExtractionPlanModel = z.infer<
  typeof aiWorkbookExtractionPlanSchema
>;
