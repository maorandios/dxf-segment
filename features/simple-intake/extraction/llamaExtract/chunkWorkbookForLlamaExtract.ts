/**
 * Mechanical workbook chunking for LlamaExtract's per-page tabular ceiling.
 *
 * LlamaExtract refuses jobs when its separator-learner finds >100 entities on one
 * "page". Sparse Excel chunks (prefix rows + large empty gap + later data rows)
 * make that learner invent far more separators than real content rows.
 *
 * Chunks are therefore written as dense contiguous tables (row 1..N, no gaps).
 * Original sheet/row provenance is kept in chunk.rowRefs and remapped after extract.
 */

import ExcelJS from "exceljs";

/**
 * Default max non-empty Excel rows per dense chunk.
 * Keep well under Llama's hard 100 entities/page ceiling.
 */
export const LLAMA_TABULAR_SAFE_ROWS_PER_CHUNK = 50;

/** Mechanical prefix of leading non-empty rows kept in every sheet chunk. */
export const LLAMA_SHEET_PREFIX_ROWS = 8;

export type LlamaWorkbookChunk = {
  bytes: Buffer;
  filename: string;
  chunkIndex: number;
  estimatedContentRows: number;
  maxRowsPerChunk: number;
  /** Dense row index (1-based) → original sheet/row. */
  rowRefs: Array<{ sheetName: string; rowNumber: number }>;
};

export type LlamaWorkbookChunkPlan = {
  chunks: LlamaWorkbookChunk[];
  totalContentRows: number;
  chunked: boolean;
  reason: string | null;
  maxRowsPerChunk: number;
};

export type PlanLlamaWorkbookChunksOptions = {
  maxRowsPerChunk?: number;
  /** Force splitting even when under the threshold (used for adaptive retry). */
  forceChunk?: boolean;
  /** Filename prefix index offset for adaptive sub-chunks. */
  indexOffset?: number;
};

type CollectedRow = {
  sheetName: string;
  rowNumber: number;
  cells: Array<{ col: number; value: ExcelJS.CellValue }>;
};

function sheetHasContent(row: ExcelJS.Row): boolean {
  let found = false;
  row.eachCell({ includeEmpty: false }, () => {
    found = true;
  });
  return found;
}

function collectRows(wb: ExcelJS.Workbook): CollectedRow[] {
  const out: CollectedRow[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (!sheetHasContent(row)) return;
      const cells: CollectedRow["cells"] = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        // Prefer plain values — formulas/rich text can confuse tabular separators.
        let value: ExcelJS.CellValue = cell.value;
        if (value && typeof value === "object" && "result" in value) {
          value = (value as ExcelJS.CellFormulaValue).result ?? null;
        }
        cells.push({ col, value });
      });
      if (cells.length === 0) return;
      out.push({ sheetName: ws.name, rowNumber, cells });
    });
  }
  return out;
}

/**
 * Write rows densely starting at row 1 on each sheet (no empty gaps).
 * Returns the dense→original mapping in write order within each sheet, flattened
 * in sheet order (same order rows are written).
 */
function buildDenseChunkWorkbook(
  rows: CollectedRow[],
  template: ExcelJS.Workbook
): { workbook: ExcelJS.Workbook; rowRefs: Array<{ sheetName: string; rowNumber: number }> } {
  const out = new ExcelJS.Workbook();
  const bySheet = new Map<string, CollectedRow[]>();
  for (const r of rows) {
    const list = bySheet.get(r.sheetName) ?? [];
    list.push(r);
    bySheet.set(r.sheetName, list);
  }

  const orderedNames: string[] = [];
  for (const ws of template.worksheets) {
    if (bySheet.has(ws.name)) orderedNames.push(ws.name);
  }
  for (const name of bySheet.keys()) {
    if (!orderedNames.includes(name)) orderedNames.push(name);
  }

  const rowRefs: Array<{ sheetName: string; rowNumber: number }> = [];

  for (const name of orderedNames) {
    const src = template.getWorksheet(name);
    const ws = out.addWorksheet(name);
    if (src?.columns) {
      src.columns.forEach((col, idx) => {
        if (!col) return;
        const target = ws.getColumn(idx + 1);
        if (col.width != null) target.width = col.width;
      });
    }
    const sheetRows = [...(bySheet.get(name) ?? [])].sort(
      (a, b) => a.rowNumber - b.rowNumber
    );
    let denseRow = 1;
    for (const r of sheetRows) {
      const row = ws.getRow(denseRow);
      for (const c of r.cells) {
        row.getCell(c.col).value = c.value;
      }
      row.commit();
      rowRefs.push({ sheetName: r.sheetName, rowNumber: r.rowNumber });
      denseRow += 1;
    }
  }
  return { workbook: out, rowRefs };
}

async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

function uniqueRows(rows: CollectedRow[]): CollectedRow[] {
  const seen = new Set<string>();
  const out: CollectedRow[] = [];
  for (const r of rows) {
    const key = `${r.sheetName}::${r.rowNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function buildChunkRowSets(
  collected: CollectedRow[],
  maxRowsPerChunk: number,
  prefixRows: number
): CollectedRow[][] {
  const bySheet = new Map<string, CollectedRow[]>();
  for (const r of collected) {
    const list = bySheet.get(r.sheetName) ?? [];
    list.push(r);
    bySheet.set(r.sheetName, list);
  }

  type SheetWindow = { sheetName: string; rows: CollectedRow[] };
  const windows: SheetWindow[] = [];

  for (const [sheetName, rows] of bySheet) {
    const sorted = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);
    if (sorted.length <= maxRowsPerChunk) {
      windows.push({ sheetName, rows: sorted });
      continue;
    }
    const prefixCount = Math.min(prefixRows, sorted.length);
    const prefix = sorted.slice(0, prefixCount);
    const rest = sorted.slice(prefixCount);
    const dataBudget = Math.max(10, maxRowsPerChunk - prefix.length);
    for (let i = 0; i < rest.length; i += dataBudget) {
      windows.push({
        sheetName,
        rows: uniqueRows([...prefix, ...rest.slice(i, i + dataBudget)]),
      });
    }
  }

  // Prefer one sheet-window per chunk so dense sourceRow remapping stays unambiguous.
  return windows.map((w) => w.rows);
}

/**
 * After dense-chunk extraction, map Llama's dense sourceRow back to the original
 * Excel row numbers recorded in rowRefs.
 */
export function remapDenseExtractResult(
  extractResult: unknown,
  rowRefs: Array<{ sheetName: string; rowNumber: number }>
): unknown {
  if (!rowRefs.length) return extractResult;

  const remapEntity = (entity: unknown): unknown => {
    if (!entity || typeof entity !== "object") return entity;
    const obj = { ...(entity as Record<string, unknown>) };
    const dense =
      typeof obj.sourceRow === "number"
        ? obj.sourceRow
        : typeof obj.sourceRow === "string" && obj.sourceRow.trim() !== ""
          ? Number(obj.sourceRow)
          : null;
    if (
      dense != null &&
      Number.isFinite(dense) &&
      Number.isInteger(dense) &&
      dense >= 1 &&
      dense <= rowRefs.length
    ) {
      const ref = rowRefs[dense - 1]!;
      obj.sourceRow = ref.rowNumber;
      if (obj.sheetName == null || String(obj.sheetName).trim() === "") {
        obj.sheetName = ref.sheetName;
      }
    }
    return obj;
  };

  if (Array.isArray(extractResult)) {
    return extractResult.map(remapEntity);
  }
  if (extractResult && typeof extractResult === "object") {
    const obj = extractResult as Record<string, unknown>;
    for (const key of ["rows", "items", "entities", "data"]) {
      if (Array.isArray(obj[key])) {
        return { ...obj, [key]: (obj[key] as unknown[]).map(remapEntity) };
      }
    }
    return remapEntity(extractResult);
  }
  return extractResult;
}

/**
 * Split a workbook into dense mechanical non-empty-row chunks when needed.
 */
export async function planLlamaWorkbookChunks(
  workbookBytes: Buffer,
  filename: string,
  options: PlanLlamaWorkbookChunksOptions = {}
): Promise<LlamaWorkbookChunkPlan> {
  const maxRowsPerChunk = Math.max(
    15,
    options.maxRowsPerChunk ?? LLAMA_TABULAR_SAFE_ROWS_PER_CHUNK
  );
  const prefixRows = Math.min(
    LLAMA_SHEET_PREFIX_ROWS,
    Math.max(2, Math.floor(maxRowsPerChunk / 6))
  );
  const forceChunk = options.forceChunk === true;
  const indexOffset = options.indexOffset ?? 0;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Uint8Array.from(workbookBytes) as unknown as ExcelJS.Buffer);

  const collected = collectRows(wb);
  const totalContentRows = collected.length;

  if (!forceChunk && totalContentRows <= maxRowsPerChunk) {
    // Still densify single-chunk uploads so sparse source sheets don't trip the limit.
    const { workbook, rowRefs } = buildDenseChunkWorkbook(collected, wb);
    const bytes = await workbookToBuffer(workbook);
    return {
      chunks: [
        {
          bytes,
          filename: filename.replace(/\.(xlsx|xls)$/i, "") + "__dense.xlsx",
          chunkIndex: indexOffset,
          estimatedContentRows: totalContentRows,
          maxRowsPerChunk,
          rowRefs,
        },
      ],
      totalContentRows,
      chunked: true,
      reason:
        "DENSE_TABLE_NORMALIZATION: rewrite contiguous rows to avoid sparse-page separator inflation",
      maxRowsPerChunk,
    };
  }

  const base = filename.replace(/\.(xlsx|xls)$/i, "") || "workbook";
  const rowSets = buildChunkRowSets(collected, maxRowsPerChunk, prefixRows);
  const chunks: LlamaWorkbookChunk[] = [];

  for (let i = 0; i < rowSets.length; i++) {
    const slice = rowSets[i]!;
    const { workbook, rowRefs } = buildDenseChunkWorkbook(slice, wb);
    const bytes = await workbookToBuffer(workbook);
    const chunkIndex = indexOffset + i;
    chunks.push({
      bytes,
      filename: `${base}__llama_chunk_${chunkIndex + 1}_r${maxRowsPerChunk}.xlsx`,
      chunkIndex,
      estimatedContentRows: slice.length,
      maxRowsPerChunk,
      rowRefs,
    });
  }

  return {
    chunks,
    totalContentRows,
    chunked: true,
    reason: `TABULAR_MAX_ITEMS_PER_PAGE_WORKAROUND: dense mechanical row chunks ≤${maxRowsPerChunk} (no empty gaps; leading rows repeated for context)`,
    maxRowsPerChunk,
  };
}

export function isTabularMaxItemsError(message: unknown): boolean {
  if (typeof message !== "string") return false;
  return (
    message.includes("TABULAR_MAX_ITEMS_PER_PAGE") ||
    message.includes("above the configured per-page ceiling")
  );
}
