/**
 * Build a mass column interpretation profile from workbook evidence.
 */

import { buildMassEvidence, type MassEvidenceNormalizedRow } from "./buildMassEvidence";
import {
  buildMassInterpretationDebugReport,
  resolveMassInterpretation,
} from "./resolveMassInterpretation";
import type { DxfMassGeometryRef } from "./buildMassEvidence";
import type {
  MassColumnInterpretation,
  MassInterpretationDebugReport,
} from "./types";
import type { SlimRegistryItem } from "../schemas";

export function buildMassColumnProfile(args: {
  documentId: string;
  sheetName?: string | null;
  tableId?: string | null;
  unitWeightColumn?: string | null;
  totalWeightColumn?: string | null;
  normalizedRows: MassEvidenceNormalizedRow[];
  registry: Array<SlimRegistryItem | DxfMassGeometryRef>;
}): {
  interpretation: MassColumnInterpretation;
  debug: MassInterpretationDebugReport;
} {
  const rows = buildMassEvidence({
    normalizedRows: args.normalizedRows,
    registry: args.registry,
  });
  const interpretation = resolveMassInterpretation({
    documentId: args.documentId,
    sheetName: args.sheetName,
    tableId: args.tableId,
    unitWeightColumn: args.unitWeightColumn,
    totalWeightColumn: args.totalWeightColumn,
    rows,
  });
  const debug = buildMassInterpretationDebugReport(interpretation, rows);
  return { interpretation, debug };
}
