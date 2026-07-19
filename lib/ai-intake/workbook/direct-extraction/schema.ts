/**
 * Zod schema for omega-direct-workbook-extraction/v2 (compact structured output).
 * No character offsets. No duplicated snapshot raw/formatted values.
 */

import { z } from "zod";

const unitSchema = z
  .enum(["MM", "CM", "M", "MM2", "CM2", "M2", "G", "KG", "TON"])
  .nullable();

const interpretationSchema = z.enum([
  "EXPLICIT",
  "PARSED_FROM_PROFILE",
  "INHERITED",
  "DERIVED",
]);

const compactFieldSchema = z.object({
  value: z.union([z.string(), z.number()]),
  sourceCell: z.string(),
  sourceText: z.string().nullable(),
  interpretation: interpretationSchema,
  confidence: z.number(),
});

const compactMeasurementSchema = z.object({
  value: z.number(),
  unit: unitSchema,
  aggregation: z.enum(["PER_ITEM", "TOTAL", "UNKNOWN"]).nullable(),
  sourceCell: z.string(),
  sourceText: z.string().nullable(),
  interpretation: interpretationSchema,
  confidence: z.number(),
});

const rowSchema = z.object({
  extractedRowId: z.string(),
  sheetName: z.string(),
  sourceRowNumbers: z.array(z.number().int()),
  sourceCells: z.array(z.string()),
  explicitPartIdentifier: compactFieldSchema.nullable(),
  sourceDescriptor: compactFieldSchema.nullable(),
  profile: compactFieldSchema.nullable(),
  quantity: compactFieldSchema.nullable(),
  material: compactFieldSchema.nullable(),
  thickness: compactMeasurementSchema.nullable(),
  width: compactMeasurementSchema.nullable(),
  length: compactMeasurementSchema.nullable(),
  area: compactMeasurementSchema.nullable(),
  unitWeight: compactMeasurementSchema.nullable(),
  totalWeight: compactMeasurementSchema.nullable(),
  notes: z.array(compactFieldSchema),
  confidence: z.number(),
  ambiguities: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().nullable(),
      competingInterpretations: z.array(z.string()).optional(),
    })
  ),
});

const ledgerSchema = z.object({
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
  ambiguityType: z.string().nullable().optional(),
  competingInterpretations: z.array(z.string()).optional(),
});

export const aiDirectWorkbookExtractionSchema = z.object({
  schemaVersion: z.literal("omega-direct-workbook-extraction/v2"),
  workbookId: z.string(),
  status: z.enum([
    "EXTRACTED",
    "EXTRACTED_WITH_WARNINGS",
    "MAPPING_REQUIRED",
    "UNSUPPORTED",
  ]),
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
  rowLedger: z.array(ledgerSchema),
  ambiguities: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      sheetName: z.string().nullable(),
      rowNumber: z.number().int().nullable(),
      competingInterpretations: z.array(z.string()).optional(),
    })
  ),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
    })
  ),
});

export type AiDirectWorkbookExtractionParsed = z.infer<
  typeof aiDirectWorkbookExtractionSchema
>;

/** Assert provider schema shape never requires AI character offsets. */
export function providerSchemaForbidsAiOffsets(): boolean {
  const row = aiDirectWorkbookExtractionSchema.shape.rows.element.shape;
  const field = row.explicitPartIdentifier.unwrap().shape;
  return (
    !("characterStart" in field) &&
    !("characterEnd" in field) &&
    !("sourceRefs" in field) &&
    "sourceCell" in field
  );
}
