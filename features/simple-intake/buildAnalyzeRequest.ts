/**
 * Build the workbook-only user prompt for Simple Intake extraction.
 * Must never include DXF filenames, identifiers, or geometry.
 */

export type SimpleAnalyzeSnapshotBody = {
  workbookId: string;
  filename: string;
  sheets: Array<{
    sheetName: string;
    maxSourceRow?: number;
    populatedRowCount?: number;
    lastPopulatedSourceRow?: number | null;
    rows: Array<{
      rowNumber: number;
      cells: Array<{ address: string; text: string }>;
    }>;
  }>;
};

export function buildSimpleAnalyzeRequestBody(
  snapshot: SimpleAnalyzeSnapshotBody
): { snapshot: SimpleAnalyzeSnapshotBody } {
  return { snapshot };
}

export function buildSimpleAnalyzeUserText(
  snapshot: SimpleAnalyzeSnapshotBody
): string {
  const sheetBounds = snapshot.sheets.map((s) => ({
    sheetName: s.sheetName,
    maxSourceRow: s.maxSourceRow ?? null,
    populatedRowCount: s.populatedRowCount ?? s.rows?.length ?? 0,
    lastPopulatedSourceRow: s.lastPopulatedSourceRow ?? null,
  }));

  return [
    "Extract all part/material rows from this workbook snapshot.",
    "Scan every populated row through each sheet's lastPopulatedSourceRow.",
    "Totals and blank rows do not end the sheet scan.",
    "Copy explicit Quantity, Material, Length, Area and Weight exactly.",
    "Preserve numeric zero as zero. Do not calculate. Do not infer weight meaning.",
    "Never use DXF filenames or DXF data. Return actual rows. Never return an Extraction Plan.",
    "",
    `workbookId=${snapshot.workbookId}`,
    `filename=${snapshot.filename}`,
    "",
    "SHEET_BOUNDARIES_JSON:",
    JSON.stringify(sheetBounds),
    "",
    "WORKBOOK_SNAPSHOT_JSON:",
    JSON.stringify(snapshot),
    "",
    "Before returning JSON, re-check every extracted row against the original source text. Confirm that explicit Quantity, Material, Length, Area and Weight values were copied and that zero values were not converted to null.",
  ].join("\n");
}

/** True if text contains DXF-derived extraction influence (excluding our ban instruction). */
export function analyzeTextContainsDxfData(userText: string): boolean {
  const withoutBan = userText.replace(
    /Never use DXF filenames or DXF data[^.]*\./gi,
    ""
  );
  return (
    /\.dxf\b/i.test(withoutBan) ||
    /knownExactIdentifiers/i.test(withoutBan) ||
    /dxfParts|dxfFilenames|dxfGeometry/i.test(withoutBan)
  );
}
