/**
 * Targeted material-list repair — Structured Output schema + prompt.
 * Separate from primary extraction schema (do not modify primary).
 */

import { z } from "zod";
import type { RepairableMaterialField } from "./types";

const repairStatusSchema = z.enum([
  "EXACT",
  "MISSING_IN_SOURCE",
  "UNRESOLVED",
]);

const stringFieldRepairSchema = z
  .object({
    value: z.string().nullable(),
    status: repairStatusSchema,
  })
  .strict();

const numberFieldRepairSchema = z
  .object({
    value: z.number().nullable(),
    status: repairStatusSchema,
  })
  .strict();

export const targetedMaterialRepairRowSchema = z
  .object({
    sheetName: z.string().nullable(),
    sourceRow: z.number().int().positive(),
    sourceCell: z.string().nullable(),
    fields: z
      .object({
        material: stringFieldRepairSchema.optional(),
        thicknessMm: numberFieldRepairSchema.optional(),
        quantity: numberFieldRepairSchema.optional(),
        widthMm: numberFieldRepairSchema.optional(),
        lengthMm: numberFieldRepairSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const targetedMaterialRepairResultSchema = z
  .object({
    rows: z.array(targetedMaterialRepairRowSchema),
  })
  .strict();

export type TargetedMaterialRepairResult = z.infer<
  typeof targetedMaterialRepairResultSchema
>;

export const TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT = `You are repairing specific missing fields in an already extracted material list.

For every supplied source row, return exactly one result using the same sourceRow.

Extract only the requested fields.

For lengthMm:
- Read the explicit value belonging to the Length field in the source row.
- Do not use profile width as length.
- Do not use quantity, area, weight, page number or row number as length.
- Preserve positive decimal values.
- Return MISSING_IN_SOURCE only when the Length value is genuinely empty.
- Return UNRESOLVED when the source contains possible values but the correct Length value cannot be identified reliably.

For material, thicknessMm, quantity and widthMm:
- Extract only the requested field from the supplied source row and nearby header context.
- Do not invent values.
- Return MISSING_IN_SOURCE only when the field is genuinely empty in the source.
- Return UNRESOLVED when possible values exist but the correct value cannot be identified reliably.

Do not create new material items.
Do not omit supplied source rows.
Do not alter profile, material, thickness, quantity or width unless that field is explicitly requested for repair.
Do not return local row IDs.
Do not use DXF, geometry, area or weight calculations.`;

export function buildTargetedRepairUserPrompt(args: {
  repairFields: RepairableMaterialField[];
  rows: Array<{
    sheetName: string | null;
    sourceRow: number;
    sourceCell: string | null;
    sourceRowText: string;
    sourceCells: Array<{ address: string; text: string }>;
    nearbyContextRows: Array<{
      rowNumber: number;
      text: string;
    }>;
  }>;
}): string {
  const payload = {
    repairFields: args.repairFields,
    instructions: [
      "Return exactly one output row per supplied source row.",
      "Use the same sheetName and sourceRow values.",
      "Populate fields only for the listed repairFields.",
      "Preserve original source text; do not translate.",
    ],
    sourceRows: args.rows,
  };
  return JSON.stringify(payload, null, 2);
}
