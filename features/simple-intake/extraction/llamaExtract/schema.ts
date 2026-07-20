/**
 * LlamaExtract v2 material-row schema (object root for per_table_row).
 */

import { z } from "zod";

export const llamaMaterialRowSchema = z.object({
  sheetName: z
    .string()
    .nullable()
    .describe(
      "The exact worksheet name containing this material row. Do not invent or translate the worksheet name. Return null only when the worksheet name is not available."
    ),
  sourceRow: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "The original one-based Excel worksheet row number. Preserve sparse row numbers and repeated sections. Do not renumber extracted rows sequentially. Return null only when the exact original Excel row cannot be determined."
    ),
  sourceCell: z
    .string()
    .nullable()
    .describe(
      "The original anchor cell for the material row, such as A18. Return null when an exact cell reference is unavailable."
    ),
  partId: z
    .string()
    .nullable()
    .describe(
      "An explicit part, item, mark, position or drawing identifier written in this source row. Do not use profile, quantity, page number or row number as a part identifier. Return null when no explicit identifier exists."
    ),
  profile: z
    .string()
    .nullable()
    .describe(
      "The plate, flat-bar or material profile exactly as written in the source, such as PL25*495 or FLT12*100. Preserve decimals. Return null when absent."
    ),
  description: z
    .string()
    .nullable()
    .describe(
      "Optional free-text description for the material row when present. Return null when absent."
    ),
  quantity: z
    .number()
    .nullable()
    .describe(
      "The explicit number of units required by this source row. One source row with quantity 16 remains one extracted row with quantity 16. Never create 16 output objects. Return null when quantity is absent. Preserve explicit zero if the document truly contains zero."
    ),
  material: z
    .string()
    .nullable()
    .describe(
      "The explicit material grade that applies to this row, such as S235, S275, S355 or 300W. Respect merged cells, grouped table context and repeated section headers only when the workbook clearly shows that the material applies to the row. Do not guess a material from similar rows."
    ),
  thicknessMm: z
    .number()
    .nullable()
    .describe(
      "Plate thickness in millimetres. It may be taken from an explicit thickness cell or from an unambiguous profile notation such as PL25*495, where 25 is the thickness. Do not calculate it from weight."
    ),
  widthMm: z
    .number()
    .nullable()
    .describe(
      "Plate width in millimetres. It may be taken from an explicit width cell or from an unambiguous profile notation such as PL25*495, where 495 is the width. Do not calculate it from area or weight."
    ),
  lengthMm: z
    .number()
    .nullable()
    .describe(
      "The explicit cut or plate length in millimetres that applies to this row. Do not calculate it from area, weight or quantity."
    ),
  sourceAreaM2: z
    .number()
    .nullable()
    .describe(
      "The area value explicitly written in the workbook for this row. Preserve explicit zero. Do not calculate or correct this field."
    ),
  sourceWeightKg: z
    .number()
    .nullable()
    .describe(
      "The weight value explicitly written in the workbook for this row. Preserve explicit zero. Do not calculate or correct this field."
    ),
});

export type LlamaMaterialRow = z.infer<typeof llamaMaterialRowSchema>;

export function buildLlamaDataSchema(): Record<string, unknown> {
  const json = z.toJSONSchema(llamaMaterialRowSchema, {
    target: "draft-7",
  }) as Record<string, unknown>;
  // Ensure object root (not array) for per_table_row entity schema.
  return json;
}

export const LLAMA_EXTRACT_SYSTEM_PROMPT = `Extract every genuine material or part row from every worksheet and every material-table section in the workbook.

Each output entity must represent exactly one original source row.

Include rows even when one or more requested fields are missing.

Exclude:
- worksheet titles
- table headers
- repeated headers
- page labels
- section labels that are not material rows
- blank separator rows
- subtotals
- grand totals
- summary rows
- notes that do not represent an ordered material item

Never stop after the first table section or the first part of a worksheet.

Process the entire workbook.

Never infer missing numeric values from totals or nearby rows.

Preserve explicit zeros exactly.

Do not calculate area, weight or quantity.

Thickness and width may be extracted from an unambiguous plate/profile notation.

Respect merged-cell and grouped-table context only when the workbook clearly indicates that the value applies to the row.

Return all genuine rows, including rows without a part identifier or material.`;
