/**
 * Material-list v1 Structured Output schema + extraction prompt.
 * Stage 1 pricing fields + optional explicit DXF filename (nullable, not required).
 */

import { z } from "zod";

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const aiMaterialListRowSchema = z.object({
  sheetName: nullableString.describe(
    "Exact worksheet name. Do not invent or translate. Null only when unavailable."
  ),
  sourceRow: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "Original one-based Excel row number. Preserve sparse numbering. Null only when unknown."
    ),
  sourceCell: nullableString.describe(
    "Original anchor cell such as A18. Null when unavailable."
  ),
  partId: nullableString.describe(
    "Explicit part/item/mark/position/drawing id. Not profile, quantity, page or row number. Null when absent."
  ),
  profile: nullableString.describe(
    "Plate/flat-bar profile exactly as written, e.g. PL25*495 or FLT12*100. Null when absent."
  ),
  description: nullableString.describe(
    "Free-text description when present. Null when absent."
  ),
  material: nullableString.describe(
    "Explicit material grade (e.g. S235, S275, S355, 300W). Inherit from merged/group context only when clearly applicable. Null when absent."
  ),
  thicknessMm: nullableNumber.describe(
    "Thickness in mm from an explicit cell or unambiguous profile (e.g. PL25*495 → 25). Do not calculate from weight. Preserve explicit zero. Null when absent."
  ),
  quantity: nullableNumber.describe(
    "Explicit unit count for this source row. One row with quantity 20 stays one object. Preserve explicit zero. Null when absent."
  ),
  widthMm: nullableNumber.describe(
    "Width in mm from an explicit cell or unambiguous profile (e.g. PL25*495 → 495). Do not calculate from area/weight. Preserve explicit zero. Null when absent."
  ),
  lengthMm: nullableNumber.describe(
    "Explicit cut/plate length in mm. Do not calculate. Preserve explicit zero. Null when absent."
  ),
  dxfFileName: nullableString.describe(
    "Explicit DXF filename associated with this material item, with or without .dxf extension. Null when absent. Do not infer from profile, dimensions, row number, quantity, material, description or unrelated nearby filenames."
  ),
});

export const aiMaterialListResultSchema = z.object({
  rows: z.array(aiMaterialListRowSchema),
});

export type AiMaterialListResultParsed = z.infer<
  typeof aiMaterialListResultSchema
>;

export const MATERIAL_LIST_SYSTEM_PROMPT = `Extract every genuine material, plate, part or ordered-item row from every worksheet and every relevant table section in the workbook.

Return exactly one output object for each genuine original source row.

Process the entire workbook. Do not stop after the first table, first page, first section or first group of rows.

Include rows even when one or more requested fields are missing.

Exclude:
- workbook titles
- table headers
- repeated headers
- page numbers
- section labels that are not material rows
- blank separators
- subtotal rows
- grand totals
- summary rows
- notes that are not ordered material items

Preserve explicit values exactly.
Preserve decimal values.
Preserve explicit numeric zero when zero is written in the workbook.
Return null only when a value is absent.

Do not calculate missing quantity, dimensions, material, area or weight.
Do not infer dimensions from weight or area.

Thickness and width may be extracted from an unambiguous profile notation such as PL25*495 or FLT12*100.

Material may be inherited from a merged cell, table group or section heading only when the workbook clearly indicates that the value applies to the row.

An explicit part identifier may be returned as partId.
A plate or flat-bar designation such as PL25*495 should normally be returned as profile, not partId.

Preserve the original worksheet name.
Preserve the original one-based Excel row number whenever available.
Preserve the source anchor cell whenever available.

Never turn one source row with quantity 20 into 20 output rows.

Extract the DXF filename that is explicitly associated with the material item, when present.
The value may appear with or without the .dxf extension.
Do not infer a DXF filename from profile, part dimensions, row number, quantity, material, description or nearby unrelated filenames.
Return null when no explicit DXF filename is provided for the item.

Do not return source area, source weight, confidence, notes or summary text.`;

export function getSimpleIntakeOpenAiModel(): string {
  const fromEnv = process.env.SIMPLE_INTAKE_OPENAI_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return "gpt-5.4-mini";
}
