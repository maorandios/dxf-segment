/**
 * Targeted material-list repair — Structured Output schema + prompt.
 * Separate from primary extraction schema (do not modify primary).
 *
 * OpenAI strict Structured Outputs: every object key must be required.
 * Unrequested fields are returned as null (never omitted / undefined).
 */

import { z } from "zod";
import type { RepairableMaterialField } from "./types";

const repairStatusSchema = z.enum([
  "EXACT",
  "MISSING_IN_SOURCE",
  "UNRESOLVED",
]);

const materialRepairFieldSchema = z
  .object({
    value: z.string().nullable(),
    status: repairStatusSchema,
    evidenceText: z.string().nullable(),
    evidenceSourceRow: z.number().int().nullable(),
  })
  .strict();

const numberRepairFieldSchema = z
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
        material: materialRepairFieldSchema.nullable(),
        thicknessMm: numberRepairFieldSchema.nullable(),
        quantity: numberRepairFieldSchema.nullable(),
        widthMm: numberRepairFieldSchema.nullable(),
        lengthMm: numberRepairFieldSchema.nullable(),
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

Extract only the requested fields listed in repairFields.

For every row.fields object you MUST include all five keys:
material, thicknessMm, quantity, widthMm, lengthMm.

- For each requested field: return an object with the required keys for that field.
- For each field that was NOT requested: return null for that key.
- Never omit keys. Never use undefined.

Status values:
- EXACT: the field value was found explicitly in the source
- MISSING_IN_SOURCE: the field is genuinely empty in the source
- UNRESOLVED: possible values exist but the correct one cannot be identified reliably

For lengthMm:
- Read the explicit value belonging to the Length field in the source row.
- Do not use profile width as length.
- Do not use quantity, area, weight, page number or row number as length.
- Preserve positive decimal values.
- Return MISSING_IN_SOURCE only when the Length value is genuinely empty.
- Return UNRESOLVED when the source contains possible values but the correct Length value cannot be identified reliably.

For thicknessMm, quantity and widthMm:
- Extract only the requested field from the supplied source row and nearby header context.
- Do not invent values.
- Return MISSING_IN_SOURCE only when the field is genuinely empty in the source.
- Return UNRESOLVED when possible values exist but the correct value cannot be identified reliably.

For material:
- Return an object with value, status, evidenceText and evidenceSourceRow.
- Return EXACT only when a material grade is explicitly visible in the supplied source row or in a supplied group/header row that clearly applies to it.
- A profile or part designation is never a material grade.
- Values such as PL31*540, FLT20*250, RHS100*50, SHS, IPE, HEA or similar section/profile descriptions must not be returned as material.
- Do not copy profile, partId or description into material.
- Do not invent or infer a material grade from profile, thickness, dimensions, quantity, area or weight.
- Do not copy a material grade from a different profile/data row that happens to share a similar profile.
- If the position where the material grade would appear is blank, return:
  value: null
  status: MISSING_IN_SOURCE
  evidenceText: null
  evidenceSourceRow: null
- When uncertain, return UNRESOLVED rather than guessing.
- For EXACT: evidenceText must contain the exact text that supports the material grade, and evidenceSourceRow must identify the supplied source or nearby context row where that text appears.
- For MISSING_IN_SOURCE or UNRESOLVED: value must be null; evidenceText and evidenceSourceRow may be null.

Do not create new material items.
Do not omit supplied source rows.
Do not alter profile or unrequested fields.
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
  const requestsMaterial = args.repairFields.includes("material");
  const instructions = [
    "Return exactly one output row per supplied source row.",
    "Use the same sheetName and sourceRow values.",
    "Populate only the listed repairFields with field objects.",
    "Set every non-requested field key to null.",
    "Include all five field keys on every row.",
    "Preserve original source text; do not translate.",
  ];
  if (requestsMaterial) {
    instructions.push(
      "For material EXACT results include evidenceText and evidenceSourceRow from the supplied source/context rows.",
      "Never return a profile or part designation as material.",
      "If the material grade cell/position is blank, return MISSING_IN_SOURCE with null value."
    );
  }
  const payload = {
    repairFields: args.repairFields,
    instructions,
    sourceRows: args.rows,
  };
  return JSON.stringify(payload, null, 2);
}
