/**
 * Deterministic Workbook Profiler — summarizes structure without business mapping.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { detectWorkbookRegions } from "./detectWorkbookRegions";
import {
  buildRowSignature,
  buildRowSignatureClusters,
} from "./buildRowSignatures";
import { selectRepresentativeRows } from "./selectRepresentativeRows";
import { fingerprintWorkbookSnapshot, cellText } from "./columnUtils";
import {
  WORKBOOK_PROFILE_SCHEMA,
  type CandidateHeaderRow,
  type WorkbookProfile,
  type WorkbookSheetProfile,
  INTERPRETER_LIMITS,
} from "./types";

const HEADER_HINTS =
  /profile|plate|material|qty|quantity|weight|length|width|thickness|part|mark|תאור|כמות|משקל|אורך|רוחב|עובי|חומר|פרופיל|מס'|מק.?ט/i;

export function buildWorkbookProfile(
  snapshot: WorkbookSnapshot
): WorkbookProfile {
  const fingerprint = fingerprintWorkbookSnapshot(snapshot);
  const sheets: WorkbookSheetProfile[] = [];

  const sheetLimit = Math.min(
    snapshot.sheets.length,
    INTERPRETER_LIMITS.maxSheetsBeforeMappingRequired
  );

  for (let i = 0; i < sheetLimit; i++) {
    const sheet = snapshot.sheets[i]!;
    const sheetId = `sheet:${i}:${sheet.sheetName}`;
    const regions = detectWorkbookRegions(sheet, sheetId);

    const byRow = new Map<number, typeof sheet.cells>();
    for (const cell of sheet.cells) {
      const list = byRow.get(cell.rowNumber) ?? [];
      list.push(cell);
      byRow.set(cell.rowNumber, list);
    }

    const signatures = [...byRow.entries()].map(([rowNumber, cells]) => ({
      rowNumber,
      signature: buildRowSignature(cells),
    }));
    const clusters = buildRowSignatureClusters(signatures);

    const candidateHeaderRows: CandidateHeaderRow[] = [];
    for (const [rowNumber, cells] of byRow) {
      const tokens = cells
        .map((c) => cellText(c.rawValue, c.formattedText).trim())
        .filter(Boolean);
      if (tokens.length < 2 && tokens.join(" ").length < 20) continue;
      const joined = tokens.join(" ");
      const hits = tokens.filter((t) => HEADER_HINTS.test(t)).length;
      const score =
        hits / Math.max(1, tokens.length) +
        (HEADER_HINTS.test(joined) ? 0.3 : 0);
      if (score >= 0.25 || hits >= 2) {
        candidateHeaderRows.push({
          rowNumber,
          confidence: Math.min(1, score),
          tokens: tokens.slice(0, 12),
          reasons: hits >= 2 ? ["VOCABULARY_HITS"] : ["HEADER_PATTERN"],
        });
      }
    }
    candidateHeaderRows.sort((a, b) => b.confidence - a.confidence);

    const { representatives, anomalies } = selectRepresentativeRows({
      sheet,
      regions,
      clusters,
      candidateHeaderRows: candidateHeaderRows.map((h) => h.rowNumber),
    });

    const hiddenRows = new Set(
      sheet.cells.filter((c) => c.isHiddenRow).map((c) => c.rowNumber)
    );
    const hiddenCols = new Set(
      sheet.cells.filter((c) => c.isHiddenColumn).map((c) => c.columnLetter)
    );

    sheets.push({
      sheetId,
      sheetName: sheet.sheetName,
      usedRange: sheet.usedRange,
      regions,
      candidateHeaderRows: candidateHeaderRows.slice(0, 12),
      rowSignatureClusters: clusters.slice(0, 24),
      representativeRows: representatives,
      anomalies,
      mergedRanges: sheet.mergedRanges,
      hiddenRowCount: hiddenRows.size,
      hiddenColumnCount: hiddenCols.size,
    });
  }

  return {
    schemaVersion: WORKBOOK_PROFILE_SCHEMA,
    workbookId: snapshot.documentId,
    fileName: snapshot.fileName,
    fingerprint,
    parserKind: snapshot.parserKind,
    sheets,
  };
}
