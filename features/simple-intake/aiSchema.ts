/**
 * Simple Intake AI schema + prompt (server-side).
 * Minimal source-copy contract — workbook only, no DXF, no weight interpretation.
 */

import { z } from "zod";

const nonnegativeNullable = z.number().nonnegative().nullable();
const positiveNullable = z.number().positive().nullable();

export const simpleAiRowSchema = z.object({
  rowId: z.string(),
  sheetName: z.string(),
  sourceRow: z.number().int(),
  sourceCell: z.string().nullable(),
  partId: z.string().nullable(),
  profile: z.string().nullable(),
  description: z.string().nullable(),
  quantity: positiveNullable,
  material: z.string().nullable(),
  thicknessMm: positiveNullable,
  widthMm: positiveNullable,
  lengthMm: positiveNullable,
  sourceAreaM2: nonnegativeNullable,
  sourceWeightKg: nonnegativeNullable,
  confidence: z.number(),
  note: z.string().nullable(),
});

export const simpleAiWorkbookResultSchema = z.object({
  status: z.enum(["SUCCESS", "NO_RELEVANT_ROWS", "UNSUPPORTED"]),
  summary: z.string(),
  rows: z.array(simpleAiRowSchema),
  warnings: z.array(z.string()),
});

export type SimpleAiWorkbookResultParsed = z.infer<
  typeof simpleAiWorkbookResultSchema
>;

export const SIMPLE_INTAKE_SYSTEM_PROMPT = `
You are the OMEGA Simple Intake workbook extractor.

Your only task: copy the explicit commercial values that appear in each genuine
workbook material or part row. Do not determine business meaning. Do not calculate.

1. Inspect every populated row in every sheet.
2. Continue through each sheet's last populated source row (lastPopulatedSourceRow).
3. Extract every genuine material or part row.
4. Exclude headers, page labels, subtotal rows and total rows.
5. A Total row does not end the sheet.
6. A blank row does not end the sheet.
7. Repeated headers may start another block.
8. Copy values from each source row exactly.
9. Preserve explicit zero values as zero.
10. Use null only when the source field is absent.
11. Do not calculate any value.
12. Do not infer weight meaning (unit vs total).
13. Do not calculate area.
14. Do not calculate weight.
15. Do not multiply or divide weight by quantity.
16. Do not omit an explicit material.
17. Do not omit an explicit Length — lengthMm has high priority.
18. Do not use DXF filenames, identifiers or geometry.
19. Preserve repeated genuine source rows separately.
20. Return the original source row and source cell (sheetName, sourceRow, sourceCell).

Field rules:
- quantity: explicit quantity only (positive when present).
- material: explicit grade/material token only (e.g. S235, S355). Never inherit.
- thicknessMm / widthMm: explicit columns when present; otherwise may parse from
  clear plate profile text (first/second numeric in PL25*480, PL12X100, FLT10*90).
  Explicit columns override profile parsing. Do not hardcode prefixes.
- lengthMm: copy the explicit Length column. Do not confuse with profile width,
  quantity, area or weight. Do not calculate. Do not use DXF.
- sourceAreaM2: explicit Area only. Preserve zero. Null only if absent.
- sourceWeightKg: explicit Weight only. Do not classify meaning. Preserve zero.
  Null only if absent.
- partId: unique mark when clearly present; otherwise null.
- profile: plate/section size text when present.
- description: free-text description when present.

Do NOT return an Extraction Plan, DSL, or parsing instructions.
Return structured JSON only. Never expose chain-of-thought.

Before returning JSON, re-check every extracted row against the original source
text. Confirm that explicit Quantity, Material, Length, Area and Weight values
were copied and that zero values were not converted to null.
`.trim();
