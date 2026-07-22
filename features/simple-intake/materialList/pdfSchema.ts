/**
 * PDF material-list Structured Output schema + extraction prompt.
 * Excel SO schema remains unchanged in schema.ts.
 */

import { z } from "zod";

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const aiPdfMaterialListRowSchema = z.object({
  sourceType: z.literal("PDF"),
  sourceFileName: z.string().min(1),
  sheetName: z.null(),
  sourceRow: z.null(),
  sourceCell: z.null(),
  sourcePage: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("One-based PDF page number for this item. Null only when unknown."),
  sourceAnchorText: nullableString.describe(
    "Short exact text copied from the source item row on the page. Null when unavailable."
  ),
  partId: nullableString,
  profile: nullableString,
  description: nullableString,
  material: nullableString,
  thicknessMm: nullableNumber,
  quantity: nullableNumber,
  widthMm: nullableNumber,
  lengthMm: nullableNumber,
  dxfFileName: nullableString,
});

export const aiPdfMaterialListResultSchema = z.object({
  rows: z.array(aiPdfMaterialListRowSchema),
});

export type AiPdfMaterialListResultParsed = z.infer<
  typeof aiPdfMaterialListResultSchema
>;

export function buildPdfMaterialExtractionPrompt(fileName: string): string {
  return `Analyze the complete supplied PDF file named "${fileName}" and create one canonical material-list row for every genuine material, plate, profile, part or ordered item.

Process every page and every relevant table or list section.
Do not stop after the first page, first table or first material group.

Include genuine item rows even when one or more requested values are missing.

Exclude:
- document titles
- table headers
- repeated page headers
- page numbers
- section labels that are not material items
- blank separators
- subtotal rows
- grand totals
- summary rows
- notes that are not ordered items

For every item:
- set sourceType to "PDF"
- set sourceFileName exactly to "${fileName}"
- set sheetName, sourceRow and sourceCell to null
- return the one-based PDF page number in sourcePage
- return a short exact sourceAnchorText copied from the source item
- preserve explicit numeric values
- preserve decimal values
- preserve explicit zero when zero is written
- return null only when a value is absent
- never calculate a missing source value
- never infer material from profile
- never use quantity, area or weight as length
- never turn one item with quantity 20 into 20 rows

Profile notation such as PL25*495 or FLT12*100 may provide thickness and width when unambiguous.

Extract a DXF filename only when it is explicitly associated with the item.
Do not infer a filename.

For scanned pages, read the visible page content.
Do not omit an item merely because it is presented as an image rather than selectable text.

Do not return calculated area, calculated weight, DXF matching, confidence scores, explanations or summary prose.`;
}
