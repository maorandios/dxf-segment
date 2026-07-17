import { z } from "zod";

const documentRowRoleSchema = z.enum([
  "PART",
  "SUBTOTAL",
  "TOTAL",
  "HEADER",
  "NOTE",
  "EMPTY",
  "UNKNOWN",
]);

const columnMapSchema = z.object({
  partReference: z.string().nullable(),
  quantity: z.string().nullable(),
  thickness: z.string().nullable(),
  material: z.string().nullable(),
  width: z.string().nullable(),
  height: z.string().nullable(),
  area: z.string().nullable(),
  totalArea: z.string().nullable(),
  unitWeight: z.string().nullable(),
  totalWeight: z.string().nullable(),
});

const tableMappingSchema = z.object({
  tableId: z.string().min(1),
  tableRange: z.string().nullable(),
  headerRowNumbers: z.array(z.number().int()),
  firstDataRow: z.number().int().nullable(),
  lastDataRow: z.number().int().nullable(),
  columns: columnMapSchema,
  columnHeaders: z.array(
    z.object({
      columnLetter: z.string(),
      rawHeaderText: z.string().nullable(),
      detectedMeaning: z.string().nullable(),
      statedUnitText: z.string().nullable(),
    })
  ),
  rowRoles: z.array(
    z.object({
      rowNumber: z.number().int(),
      role: documentRowRoleSchema,
      reason: z.string(),
    })
  ),
  warnings: z.array(z.string()),
});

/**
 * OpenAI spreadsheet output — structure/pointers only.
 * Server-only fields (metadataRowNumbers, headerCellReferences) must NOT appear here:
 * OpenAI structured outputs reject .optional() without .nullable().
 */
export const aiWorkbookMappingResultSchema = z.object({
  sheets: z.array(
    z.object({
      sheetName: z.string().min(1),
      tables: z.array(tableMappingSchema),
      unmappedNonEmptyRows: z.array(z.number().int()),
    })
  ),
  unresolvedItems: z.array(
    z.object({
      rawPartReference: z.string().nullable(),
      description: z.string(),
      reason: z.string(),
      location: z.object({
        sheetName: z.string().nullable(),
        visibleRowNumber: z.number().int().nullable(),
        pageNumber: z.number().int().nullable(),
        excerpt: z.string().nullable(),
      }),
    })
  ),
  warnings: z.array(z.string()),
});

export type AiWorkbookMappingModelResult = z.infer<
  typeof aiWorkbookMappingResultSchema
>;
