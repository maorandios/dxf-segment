/**
 * PDF targeted repair — strict SO schema + prompts.
 * Merge key is repairTargetId only (never profile / order / fuzzy).
 */

import { z } from "zod";
import type { RepairableMaterialField } from "./types";

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

const materialRepairFieldSchema = z.object({
  status: z.enum(["EXACT", "MISSING_IN_SOURCE", "UNRESOLVED"]),
  value: nullableString,
  evidenceText: nullableString,
});

const numberRepairFieldSchema = z.object({
  status: z.enum(["EXACT", "MISSING_IN_SOURCE", "UNRESOLVED"]),
  value: nullableNumber,
  evidenceText: nullableString,
});

const stringRepairFieldSchema = z.object({
  status: z.enum(["EXACT", "MISSING_IN_SOURCE", "UNRESOLVED"]),
  value: nullableString,
  evidenceText: nullableString,
});

export const pdfTargetedRepairResultSchema = z.object({
  rows: z.array(
    z.object({
      repairTargetId: z.string().min(1),
      fields: z.object({
        material: materialRepairFieldSchema.nullable(),
        thicknessMm: numberRepairFieldSchema.nullable(),
        quantity: numberRepairFieldSchema.nullable(),
        widthMm: numberRepairFieldSchema.nullable(),
        lengthMm: numberRepairFieldSchema.nullable(),
        dxfFileName: stringRepairFieldSchema.nullable(),
      }),
    })
  ),
});

export type PdfTargetedRepairResult = z.infer<
  typeof pdfTargetedRepairResultSchema
>;

export type PdfRepairTarget = {
  repairTargetId: string;
  sourcePage: number | null;
  sourceAnchorText: string | null;
  requestedFields: Array<RepairableMaterialField | "dxfFileName">;
};

export const PDF_TARGETED_REPAIR_SYSTEM_PROMPT = `You repair missing material-list fields for specific PDF items.

Echo the exact repairTargetId for every returned row.
Return only requested fields; set unrequested fields to null.
Do not create new material items.
Do not invent values.
Do not accept a profile/partId/description as material.
Preserve explicit zeros only when written; otherwise return MISSING_IN_SOURCE or UNRESOLVED.`;

export function buildPdfTargetedRepairUserPrompt(args: {
  repairFields: Array<RepairableMaterialField | "dxfFileName">;
  targets: PdfRepairTarget[];
}): string {
  return `Repair only the requested fields for these PDF material items.

Requested fields: ${args.repairFields.join(", ")}

Targets (JSON):
${JSON.stringify(args.targets, null, 2)}

For each target, echo repairTargetId exactly.
Use sourcePage and sourceAnchorText to locate the item in the supplied PDF.
Unrequested field keys must be null.`;
}
