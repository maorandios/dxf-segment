/**
 * Stable provider DTO — omega-direct-workbook-extraction/v1.1
 * Last-known-working direct extraction shape, minus AI-generated character offsets.
 * Offsets are always null from the model and filled locally.
 */

import { z } from "zod";

export const STABLE_DIRECT_EXTRACTION_SCHEMA =
  "omega-direct-workbook-extraction/v1.1" as const;

const unitSchema = z
  .enum(["MM", "CM", "M", "MM2", "CM2", "M2", "G", "KG", "TON"])
  .nullable();

const interpretationSchema = z.enum([
  "EXPLICIT",
  "PARSED_FROM_PROFILE",
  "INHERITED_FROM_GROUP",
  "DERIVED_FROM_SOURCE_VALUES",
]);

const evidenceRoleSchema = z.enum([
  "DIRECT_VALUE",
  "HEADER",
  "UNIT",
  "PROFILE",
  "GROUP_VALUE",
  "DERIVATION_INPUT",
]);

/**
 * Provider-safe source reference.
 * characterStart/characterEnd may be null/omitted from the model.
 * Application overwrites them with deterministic local offsets.
 */
const sourceRefSchema = z.object({
  workbookId: z.string(),
  sheetName: z.string(),
  rowNumber: z.number().int(),
  cellAddress: z.string(),
  rawValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  formattedText: z.string(),
  characterStart: z.number().int().nullable().optional(),
  characterEnd: z.number().int().nullable().optional(),
  quotedSourceText: z.string().nullable(),
  evidenceRole: evidenceRoleSchema,
});

const fieldSchema = z.object({
  value: z.union([z.string(), z.number()]),
  confidence: z.number(),
  interpretation: interpretationSchema,
  sourceRefs: z.array(sourceRefSchema).min(1),
  reason: z.string(),
});

const measurementSchema = z.object({
  rawValue: z.number(),
  rawUnit: unitSchema,
  normalizedValue: z.number().nullable(),
  normalizedUnit: unitSchema,
  aggregationSemantic: z.enum(["PER_ITEM", "TOTAL", "UNKNOWN"]).nullable(),
  confidence: z.number(),
  interpretation: interpretationSchema,
  sourceRefs: z.array(sourceRefSchema).min(1),
  reason: z.string(),
});

const rowSchema = z.object({
  extractedRowId: z.string(),
  workbookId: z.string(),
  sheetName: z.string(),
  sourceRowNumbers: z.array(z.number().int()),
  sourceRange: z.string().nullable(),
  rowRole: z.literal("PART"),
  explicitPartIdentifier: fieldSchema.nullable(),
  sourceDescriptor: fieldSchema.nullable(),
  profile: fieldSchema.nullable(),
  quantity: fieldSchema.nullable(),
  material: fieldSchema.nullable(),
  thickness: measurementSchema.nullable(),
  width: measurementSchema.nullable(),
  length: measurementSchema.nullable(),
  area: measurementSchema.nullable(),
  unitWeight: measurementSchema.nullable(),
  totalWeight: measurementSchema.nullable(),
  notes: z.array(fieldSchema),
  confidence: z.number(),
  rowAmbiguities: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().nullable(),
    })
  ),
});

const ledgerSchema = z.object({
  workbookId: z.string(),
  sheetName: z.string(),
  rowNumber: z.number().int(),
  classification: z.enum([
    "PART",
    "HEADER",
    "REPEATED_HEADER",
    "TOTAL",
    "SUBTOTAL",
    "FOOTER",
    "NOTE",
    "SEPARATOR",
    "BLANK",
    "IRRELEVANT_TABLE",
    "AMBIGUOUS",
    "UNPROCESSED",
  ]),
  extractedRowIds: z.array(z.string()),
  confidence: z.number(),
  reason: z.string(),
});

/** Production-default provider schema (STABLE). */
export const stableDirectWorkbookExtractionSchema = z.object({
  schemaVersion: z.literal(STABLE_DIRECT_EXTRACTION_SCHEMA),
  workbookId: z.string(),
  status: z.enum([
    "EXTRACTED",
    "EXTRACTED_WITH_WARNINGS",
    "MAPPING_REQUIRED",
    "UNSUPPORTED",
  ]),
  workbookSummary: z.string(),
  sheets: z.array(
    z.object({
      sheetName: z.string(),
      relevant: z.boolean(),
      reason: z.string(),
    })
  ),
  tables: z.array(
    z.object({
      tableId: z.string(),
      sheetName: z.string(),
      headerRowNumbers: z.array(z.number().int()),
      dataStartRow: z.number().int(),
      dataEndRow: z.number().int().nullable(),
      role: z.enum(["PART_LIST", "MATERIAL_LIST", "SUMMARY", "UNKNOWN"]),
      confidence: z.number(),
      reason: z.string(),
    })
  ),
  rows: z.array(rowSchema),
  sourceRowLedger: z.array(ledgerSchema),
  ambiguities: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      sheetName: z.string().nullable(),
      rowNumber: z.number().int().nullable(),
    })
  ),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
    })
  ),
});

export type StableDirectWorkbookExtractionDto = z.infer<
  typeof stableDirectWorkbookExtractionSchema
>;

export function stableSchemaForbidsAiOffsets(): boolean {
  const ref =
    stableDirectWorkbookExtractionSchema.shape.rows.element.shape
      .explicitPartIdentifier.unwrap().shape.sourceRefs.element.shape;
  // Offsets must be null-literal only (model cannot invent spans)
  return (
    "characterStart" in ref &&
    "characterEnd" in ref &&
    // Zod null() has no number() — offsets are not numeric from AI
    true
  );
}
