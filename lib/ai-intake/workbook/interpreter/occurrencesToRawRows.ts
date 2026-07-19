/**
 * Convert interpreter occurrences → RawDocumentPartRow for existing normalize path.
 */

import type {
  LengthOrAreaOrMassUnit,
  RawDocumentPartRow,
  RawMeasurement,
  WorkbookSnapshot,
} from "../../normalization/types";
import { parsePlateProfile } from "../fixed-width/parsePlateProfile";
import type {
  ExtractedFieldValue,
  ExtractedWorkbookOccurrence,
  WorkbookExtractionPlan,
} from "./types";

function rawMeas(args: {
  field: ExtractedFieldValue | undefined;
  unitFallback: LengthOrAreaOrMassUnit | null;
  header: string | null;
}): RawMeasurement | null {
  if (!args.field) return null;
  const text = args.field.textValue;
  const num = args.field.numberValue;
  if ((text == null || text === "") && num == null) return null;
  const rawText = text ?? String(num);
  const value =
    num != null && Number.isFinite(num)
      ? num
      : Number.parseFloat(String(rawText).replace(/,/g, ""));
  const cell = args.field.provenance.cellAddresses[0] ?? null;
  return {
    rawValue: Number.isFinite(value) ? value : rawText,
    rawText,
    statedUnit: args.field.unit ?? args.unitFallback,
    rawHeader: args.header,
    displayedDecimalPlaces:
      num != null && String(num).includes(".")
        ? String(num).split(".")[1]?.length ?? null
        : null,
    sourceCell: cell,
    numberFormat: null,
    formula: null,
    formulaResult: null,
    origin: "DETERMINISTIC_WORKBOOK_CELL",
  };
}

function fieldOf(
  occ: ExtractedWorkbookOccurrence,
  target: ExtractedFieldValue["targetField"]
): ExtractedFieldValue | undefined {
  return occ.fields.find((f) => f.targetField === target);
}

export function occurrencesToRawDocumentPartRows(args: {
  snapshot: WorkbookSnapshot;
  plan: WorkbookExtractionPlan;
  occurrences: ExtractedWorkbookOccurrence[];
}): RawDocumentPartRow[] {
  const rows: RawDocumentPartRow[] = [];

  for (const occ of args.occurrences) {
    const table = args.plan.tables.find((t) => t.tableId === occ.tableId);
    const qty = fieldOf(occ, "QUANTITY");
    const thickness = fieldOf(occ, "THICKNESS");
    const width = fieldOf(occ, "WIDTH");
    const length = fieldOf(occ, "LENGTH");
    const area = fieldOf(occ, "AREA");
    const unitWeight = fieldOf(occ, "UNIT_WEIGHT");
    const totalWeight = fieldOf(occ, "TOTAL_WEIGHT");
    const material = fieldOf(occ, "MATERIAL");
    const notes = fieldOf(occ, "NOTES");
    const profile = fieldOf(occ, "PROFILE");

    // Derive thickness/width from profile when mapped to PROFILE
    let thicknessMeas = rawMeas({
      field: thickness,
      unitFallback: thickness?.unit ?? "MM",
      header: table?.fields.find((f) => f.targetField === "THICKNESS")?.reasons[0] ?? null,
    });
    let widthMeas = rawMeas({
      field: width,
      unitFallback: width?.unit ?? "MM",
      header: table?.fields.find((f) => f.targetField === "WIDTH")?.reasons[0] ?? null,
    });

    if (profile?.textValue && (!thicknessMeas || !widthMeas)) {
      const parsed = parsePlateProfile(profile.textValue);
      if (
        parsed.status === "PARSED_EXPLICIT_PROFILE" ||
        parsed.status === "PARSED_WITH_NORMALIZED_SEPARATOR"
      ) {
        const cell = profile.provenance.cellAddresses[0] ?? null;
        if (!thicknessMeas && parsed.thicknessMm != null) {
          thicknessMeas = {
            rawValue: parsed.thicknessMm,
            rawText: String(parsed.thicknessMm),
            statedUnit: "MM",
            rawHeader: "PROFILE",
            displayedDecimalPlaces: null,
            sourceCell: cell,
            numberFormat: null,
            formula: null,
            formulaResult: null,
            origin: "DETERMINISTIC_WORKBOOK_CELL",
          };
        }
        if (!widthMeas && parsed.widthMm != null) {
          widthMeas = {
            rawValue: parsed.widthMm,
            rawText: String(parsed.widthMm),
            statedUnit: "MM",
            rawHeader: "PROFILE",
            displayedDecimalPlaces: null,
            sourceCell: cell,
            numberFormat: null,
            formula: null,
            formulaResult: null,
            origin: "DETERMINISTIC_WORKBOOK_CELL",
          };
        }
      }
    }

    let materialText = material?.textValue ?? null;
    // Never use full aligned line as material
    if (
      material &&
      materialText &&
      material.provenance.originalCellText &&
      materialText.trim() === material.provenance.originalCellText.trim() &&
      materialText.length > 40
    ) {
      materialText = null;
    }

    // Identifier distinction: only EXPLICIT_PART_IDENTIFIER
    const rawPartReference = occ.explicitPartIdentifier;
    const description =
      occ.sourceDescriptor ??
      occ.profileRaw ??
      profile?.textValue ??
      null;

    const partCell =
      fieldOf(occ, "EXPLICIT_PART_IDENTIFIER")?.provenance.cellAddresses[0] ??
      profile?.provenance.cellAddresses[0] ??
      null;

    rows.push({
      occurrenceId: occ.occurrenceId,
      documentId: args.snapshot.documentId,
      rowRole: "PART",
      matchedDxfPartId: null,
      rawPartReference,
      partReferenceCell: rawPartReference ? partCell : null,
      materialCell: material?.provenance.cellAddresses[0] ?? null,
      quantity: rawMeas({
        field: qty,
        unitFallback: null,
        header: "QUANTITY",
      }),
      thickness: thicknessMeas,
      material: materialText,
      width: widthMeas,
      height: rawMeas({
        field: length,
        unitFallback: length?.unit ?? "MM",
        header: "LENGTH",
      }),
      area: rawMeas({
        field: area,
        unitFallback: area?.unit ?? null,
        header: "AREA",
      }),
      totalArea: null,
      unitWeight: rawMeas({
        field: unitWeight,
        unitFallback: unitWeight?.unit ?? null,
        header: "UNIT_WEIGHT",
      }),
      totalWeight: rawMeas({
        field: totalWeight,
        unitFallback: totalWeight?.unit ?? null,
        header: "TOTAL_WEIGHT",
      }),
      description,
      notes: notes?.textValue ?? null,
      source: {
        type: "XLSX",
        fileName: args.snapshot.fileName,
        sheetName: occ.sheetName,
        rowNumber: occ.rowNumber,
        pageNumber: null,
        excerpt: occ.profileRaw ?? occ.sourceDescriptor,
        tableId: occ.tableId,
      },
      extractionIssues: [
        `PLAN:${args.plan.planId}`,
        `PLAN_SOURCE:${args.plan.planSource}`,
      ],
      isHiddenRow: false,
    });
  }

  return rows;
}
