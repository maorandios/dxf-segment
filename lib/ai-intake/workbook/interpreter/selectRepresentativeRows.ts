/**
 * Deterministic representative-row selection for planner input.
 */

import type { WorkbookSheetSnapshot } from "../../normalization/types";
import { cellText } from "./columnUtils";
import type {
  ProfiledWorkbookRow,
  WorkbookRegionProfile,
  RowSignatureCluster,
} from "./types";
import { INTERPRETER_LIMITS } from "./types";
import { buildRowSignature } from "./buildRowSignatures";

export function selectRepresentativeRows(args: {
  sheet: WorkbookSheetSnapshot;
  regions: WorkbookRegionProfile[];
  clusters: RowSignatureCluster[];
  candidateHeaderRows: number[];
}): { representatives: ProfiledWorkbookRow[]; anomalies: ProfiledWorkbookRow[] } {
  const byRow = new Map<number, typeof args.sheet.cells>();
  for (const cell of args.sheet.cells) {
    const list = byRow.get(cell.rowNumber) ?? [];
    list.push(cell);
    byRow.set(cell.rowNumber, list);
  }

  const selected = new Map<number, ProfiledWorkbookRow>();

  const add = (rowNumber: number, reason: string) => {
    if (selected.has(rowNumber)) {
      const prev = selected.get(rowNumber)!;
      selected.set(rowNumber, {
        ...prev,
        reason: `${prev.reason};${reason}`,
      });
      return;
    }
    const cells = byRow.get(rowNumber) ?? [];
    const texts = cells
      .map((c) => cellText(c.rawValue, c.formattedText).trim())
      .filter(Boolean);
    selected.set(rowNumber, {
      rowNumber,
      signature: buildRowSignature(cells),
      meaningfulCellCount: texts.length,
      textPreview: texts.join(" | ").slice(0, 200),
      hasFormula: cells.some((c) => Boolean(c.formula)),
      reason,
    });
  };

  for (const region of args.regions) {
    const rows = [...byRow.keys()]
      .filter((r) => r >= region.startRow && r <= region.endRow)
      .sort((a, b) => a - b);
    if (rows.length === 0) continue;
    add(rows[0]!, "REGION_BEGIN");
    add(rows[rows.length - 1]!, "REGION_END");
    if (rows.length > 2) {
      add(rows[Math.floor(rows.length / 2)]!, "REGION_MIDDLE");
    }
    const perRegion = INTERPRETER_LIMITS.maxRepresentativeRowsPerRegion;
    const step = Math.max(1, Math.floor(rows.length / perRegion));
    for (let i = 0; i < rows.length && selected.size < 200; i += step) {
      add(rows[i]!, "REGION_SAMPLE");
    }
  }

  for (const cluster of args.clusters) {
    for (const r of cluster.sampleRowNumbers.slice(0, 2)) {
      add(r, `CLUSTER:${cluster.signature}`);
    }
  }

  for (const hr of args.candidateHeaderRows) {
    add(hr, "CANDIDATE_HEADER");
  }

  // Anomalies: very long / short / formula / sparse
  const anomalies: ProfiledWorkbookRow[] = [];
  const lengths: number[] = [];
  for (const [rowNumber, cells] of byRow) {
    const texts = cells
      .map((c) => cellText(c.rawValue, c.formattedText).trim())
      .filter(Boolean);
    const joined = texts.join(" ");
    lengths.push(joined.length);
    if (cells.some((c) => c.formula)) {
      add(rowNumber, "HAS_FORMULA");
    }
  }
  lengths.sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0;

  for (const [rowNumber, cells] of byRow) {
    const texts = cells
      .map((c) => cellText(c.rawValue, c.formattedText).trim())
      .filter(Boolean);
    const joined = texts.join(" ");
    if (joined.length > median * 3 + 40 || (median > 10 && joined.length < 3)) {
      const row: ProfiledWorkbookRow = {
        rowNumber,
        signature: buildRowSignature(cells),
        meaningfulCellCount: texts.length,
        textPreview: joined.slice(0, 200),
        hasFormula: cells.some((c) => Boolean(c.formula)),
        reason: "LENGTH_ANOMALY",
      };
      anomalies.push(row);
      add(rowNumber, "LENGTH_ANOMALY");
    }
  }

  const representatives = [...selected.values()]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .slice(0, INTERPRETER_LIMITS.maxRepresentativeRowsPerRegion * 8);

  return {
    representatives,
    anomalies: anomalies.slice(0, INTERPRETER_LIMITS.maxAnomalyRows),
  };
}
