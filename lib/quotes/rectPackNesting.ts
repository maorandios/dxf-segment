/**
 * Lightweight rectangle-pack sheet estimator for Quick Quote.
 *
 * Algorithm: Maximal Rectangles (MaxRects) with multi-heuristic search.
 *
 * For each thickness the packer automatically tries 6 combinations of:
 *   Sort order  × Scoring heuristic:
 *     - area   × BSSF  (Best Short Side Fit)
 *     - area   × BAF   (Best Area Fit)
 *     - long   × BSSF
 *     - long   × BAF
 *     - short  × BSSF
 *     - short  × BAF
 * …in both portrait and landscape bin orientations (12 runs total per stock
 * size per thickness).  The combination that needs the fewest sheets wins.
 *
 * This removes two classes of failure from the earlier single-heuristic build:
 *   1. "Staircase" columns of tall/narrow plates — long-side sort groups same-
 *      height plates together so they fill a row before starting the next.
 *   2. Interior holes — BAF scoring prefers the tightest-area free rect, which
 *      keeps the waste consolidated at one edge rather than scattered.
 *
 * Performance: for ≤ 2 000 expanded instances all 12 runs are tried; above
 * that threshold only the 2 most reliable combos run to stay under ~200 ms.
 */

// ---------------------------------------------------------------------------
// Public types (unchanged interface)
// ---------------------------------------------------------------------------

export interface RectPackPart {
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  areaM2: number;
  qty: number;
}

export interface RectPackStockLine {
  sheetWidthMm: number;
  sheetLengthMm: number;
}

export interface RectPackThicknessResult {
  thicknessMm: number;
  sheetCount: number;
  sheetWidthMm: number;
  sheetLengthMm: number;
  sheetAreaM2: number;
  netAreaM2: number;
  wasteAreaM2: number;
  utilizationPct: number;
  oversizeParts: number;
}

export interface RectPackResult {
  totalSheetAreaM2: number;
  totalNetAreaM2: number;
  totalWasteAreaM2: number;
  estimatedSheetCount: number;
  utilizationPct: number;
  perThickness: RectPackThicknessResult[];
}

export interface PlacedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetLayout {
  thicknessMm: number;
  sheetWidthMm: number;
  sheetLengthMm: number;
  sheetIndex: number;
  totalSheetsForThickness: number;
  placements: PlacedRect[];
  netAreaM2: number;
  utilizationPct: number;
}

export interface RectPackWithPlacementsResult {
  summary: RectPackResult;
  layouts: SheetLayout[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Instance {
  w: number;
  h: number;
  areaMm2: number;
}

interface PlacedInstance extends Instance {
  px: number;
  py: number;
  pw: number;
  ph: number;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EPS_MM = 0.5;
const DEFAULT_SPACING_MM = 0;

/** Heuristics tried per bin orientation per stock size. */
type ScoreMode = 'bssf' | 'baf';
type SortMode  = 'area' | 'longSide' | 'shortSide';

const ALL_SORT_MODES:  SortMode[]  = ['area', 'longSide', 'shortSide'];
const ALL_SCORE_MODES: ScoreMode[] = ['bssf', 'baf'];

/** Above this count only the 2 most reliable combos run. */
const FAST_THRESHOLD = 2_000;

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** Sort by area descending */
function sortByArea(arr: Instance[]): void {
  arr.sort((a, b) => b.areaMm2 - a.areaMm2);
}

/** Sort by longer side descending — groups same-height plates together */
function sortByLong(arr: Instance[]): void {
  arr.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
}

/** Sort by shorter side descending — fills wide rows first */
function sortByShort(arr: Instance[]): void {
  arr.sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h));
}

function applySortMode(instances: Instance[], mode: SortMode): Instance[] {
  const arr = [...instances];
  if (mode === 'area')      sortByArea(arr);
  else if (mode === 'longSide')  sortByLong(arr);
  else                     sortByShort(arr);
  return arr;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Returns a "fit quality" score; lower = better placement for the given part
 * (fw × fh = part dimensions only) inside free rect `fr`.
 *
 * BSSF – Best Short Side Fit: minimize the shorter remaining dimension.
 *         Avoids narrow slivers that become unusable.
 * BAF  – Best Area Fit: minimize remaining free area.
 *         Keeps waste consolidated → fewer interior holes.
 */
function fitScore(fr: FreeRect, fw: number, fh: number, mode: ScoreMode): number {
  if (mode === 'bssf') return Math.min(fr.w - fw, fr.h - fh);
  return fr.w * fr.h - fw * fh; // BAF
}

// ---------------------------------------------------------------------------
// MaxRects free-rect maintenance
// ---------------------------------------------------------------------------

function pruneFreeRects(rects: FreeRect[]): void {
  for (let i = rects.length - 1; i >= 0; i--) {
    const a = rects[i];
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue;
      const b = rects[j];
      if (
        b.x <= a.x + EPS_MM &&
        b.y <= a.y + EPS_MM &&
        b.x + b.w >= a.x + a.w - EPS_MM &&
        b.y + b.h >= a.y + a.h - EPS_MM
      ) {
        rects.splice(i, 1);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Core MaxRects placer (one sheet)
// ---------------------------------------------------------------------------

/** Result when trackPositions=false */
interface PackResult {
  placed: Instance[];
  remaining: Instance[];
  usedAreaMm2: number;
}
/** Result when trackPositions=true */
interface PackResultWithPos {
  placed: PlacedInstance[];
  remaining: Instance[];
}

function maxRectsOneSheet(
  instances: Instance[],
  binW: number,
  binH: number,
  spacing: number,
  scoreMode: ScoreMode,
  trackPositions: false
): PackResult;
function maxRectsOneSheet(
  instances: Instance[],
  binW: number,
  binH: number,
  spacing: number,
  scoreMode: ScoreMode,
  trackPositions: true
): PackResultWithPos;
function maxRectsOneSheet(
  instances: Instance[],
  binW: number,
  binH: number,
  spacing: number,
  scoreMode: ScoreMode,
  trackPositions: boolean
): PackResult | PackResultWithPos {
  const placed: (Instance | PlacedInstance)[] = [];
  const remaining: Instance[] = [];
  let usedAreaMm2 = 0;

  const freeRects: FreeRect[] = [{ x: 0, y: 0, w: binW, h: binH }];

  for (const inst of instances) {
    // Try original orientation and 90° rotation
    const orientations: [number, number][] =
      Math.abs(inst.w - inst.h) < EPS_MM
        ? [[inst.w, inst.h]]
        : [[inst.w, inst.h], [inst.h, inst.w]];

    let bestScore = Infinity;
    let bestFri   = -1;
    let bestIw    = 0;
    let bestIh    = 0;

    for (let fri = 0; fri < freeRects.length; fri++) {
      const fr = freeRects[fri];
      for (const [iw, ih] of orientations) {
        // Fit by raw size so parts can touch sheet edges.
        // Inter-part gap is applied in split-space step below.
        const fw = iw;
        const fh = ih;
        if (fw <= fr.w + EPS_MM && fh <= fr.h + EPS_MM) {
          const s = fitScore(fr, fw, fh, scoreMode);
          if (s < bestScore) {
            bestScore = s;
            bestFri   = fri;
            bestIw    = iw;
            bestIh    = ih;
          }
        }
      }
    }

    if (bestFri === -1) {
      remaining.push(inst);
      continue;
    }

    const fr = freeRects[bestFri];
    const px = fr.x;
    const py = fr.y;
    // Keep exactly `spacing` only between parts (right/bottom side),
    // but never force a gap to the sheet edge.
    const pr = Math.min(binW, px + bestIw + spacing);
    const pb = Math.min(binH, py + bestIh + spacing);

    if (trackPositions) {
      (placed as PlacedInstance[]).push({ ...inst, px, py, pw: bestIw, ph: bestIh });
    } else {
      placed.push(inst);
    }
    usedAreaMm2 += inst.areaMm2;

    // Split all overlapping free rects
    const toAdd: FreeRect[] = [];
    for (let i = freeRects.length - 1; i >= 0; i--) {
      const r = freeRects[i];
      const overlaps =
        px < r.x + r.w - EPS_MM && pr > r.x + EPS_MM &&
        py < r.y + r.h - EPS_MM && pb > r.y + EPS_MM;
      if (!overlaps) continue;

      freeRects.splice(i, 1);
      if (r.x < px)      toAdd.push({ x: r.x, y: r.y, w: px - r.x,           h: r.h });
      if (pr < r.x + r.w) toAdd.push({ x: pr,  y: r.y, w: r.x + r.w - pr,    h: r.h });
      if (r.y < py)      toAdd.push({ x: r.x, y: r.y, w: r.w, h: py - r.y });
      if (pb < r.y + r.h) toAdd.push({ x: r.x, y: pb,  w: r.w, h: r.y + r.h - pb });
    }
    freeRects.push(...toAdd);
    pruneFreeRects(freeRects);
  }

  if (trackPositions) {
    return { placed: placed as PlacedInstance[], remaining };
  }
  return { placed: placed as Instance[], remaining, usedAreaMm2 };
}

// ---------------------------------------------------------------------------
// Multi-sheet packing for one combination
// ---------------------------------------------------------------------------

function packAllIntoSheets(
  sortedInstances: Instance[],
  binW: number,
  binH: number,
  spacing: number,
  scoreMode: ScoreMode
): { sheetCount: number; totalSheetAreaMm2: number; oversizeParts: number } {
  const sheetAreaMm2 = binW * binH;
  let remaining = sortedInstances;
  let sheetCount = 0;
  let oversizeParts = 0;

  while (remaining.length > 0) {
    const { placed, remaining: next } = maxRectsOneSheet(
      remaining, binW, binH, spacing, scoreMode, false
    );
    if (placed.length === 0) {
      oversizeParts += remaining.length;
      sheetCount += remaining.length;
      break;
    }
    sheetCount++;
    remaining = next;
  }

  return { sheetCount, totalSheetAreaMm2: sheetCount * sheetAreaMm2, oversizeParts };
}

// ---------------------------------------------------------------------------
// Best-combination search
// ---------------------------------------------------------------------------

interface BestPackResult {
  sheetCount: number;
  totalSheetAreaMm2: number;
  oversizeParts: number;
  binW: number;
  binH: number;
  sortMode: SortMode;
  scoreMode: ScoreMode;
}

/**
 * Try all sort × score combinations in both orientations.
 * For large instance sets only the two most reliable combos run.
 */
function findBestPack(
  rawInstances: Instance[],
  sheetWidthMm: number,
  sheetLengthMm: number,
  spacing: number
): BestPackResult {
  const large = rawInstances.length > FAST_THRESHOLD;
  const sortModes:  SortMode[]  = large ? ['area', 'longSide']   : ALL_SORT_MODES;
  const scoreModes: ScoreMode[] = large ? ['bssf', 'baf']        : ALL_SCORE_MODES;
  const isSquare = Math.abs(sheetWidthMm - sheetLengthMm) < EPS_MM;
  const orientations: [number, number][] = isSquare
    ? [[sheetWidthMm, sheetLengthMm]]
    : [[sheetWidthMm, sheetLengthMm], [sheetLengthMm, sheetWidthMm]];

  let best: BestPackResult | null = null;

  for (const [binW, binH] of orientations) {
    for (const sortMode of sortModes) {
      const sorted = applySortMode(rawInstances, sortMode);
      for (const scoreMode of scoreModes) {
        const res = packAllIntoSheets(sorted, binW, binH, spacing, scoreMode);
        if (
          best === null ||
          res.sheetCount < best.sheetCount ||
          (res.sheetCount === best.sheetCount &&
            res.totalSheetAreaMm2 < best.totalSheetAreaMm2)
        ) {
          best = { ...res, binW, binH, sortMode, scoreMode };
        }
      }
    }
  }

  // Should never be null (rawInstances > 0 is checked by callers)
  return best!;
}

// ---------------------------------------------------------------------------
// Per-thickness estimation
// ---------------------------------------------------------------------------

function buildBaseInstances(parts: RectPackPart[]): Instance[] {
  const out: Instance[] = [];
  for (const p of parts) {
    const qty = Math.max(0, Math.min(Math.round(p.qty), 50_000));
    const w = Math.max(0, p.widthMm);
    const h = Math.max(0, p.lengthMm);
    for (let i = 0; i < qty; i++) out.push({ w, h, areaMm2: w * h });
  }
  return out;
}

function estimateForThickness(
  thicknessMm: number,
  parts: RectPackPart[],
  stockLines: RectPackStockLine[],
  spacing: number
): RectPackThicknessResult | null {
  if (stockLines.length === 0) return null;

  const baseInstances = buildBaseInstances(parts);
  if (baseInstances.length === 0) return null;

  const totalNetMm2 = baseInstances.reduce((s, i) => s + i.areaMm2, 0);
  const totalNetM2  = totalNetMm2 / 1_000_000;

  let bestResult: RectPackThicknessResult | null = null;

  for (const line of stockLines) {
    const { sheetWidthMm, sheetLengthMm } = line;
    if (sheetWidthMm <= 0 || sheetLengthMm <= 0) continue;

    const pack = findBestPack(baseInstances, sheetWidthMm, sheetLengthMm, spacing);

    const sheetAreaM2      = (sheetWidthMm * sheetLengthMm) / 1_000_000;
    const totalSheetAreaM2 = pack.totalSheetAreaMm2 / 1_000_000;
    const wasteAreaM2      = Math.max(0, totalSheetAreaM2 - totalNetM2);
    const utilizationPct   =
      totalSheetAreaM2 > 0
        ? Math.round((totalNetM2 / totalSheetAreaM2) * 1000) / 10
        : 0;

    const candidate: RectPackThicknessResult = {
      thicknessMm,
      sheetCount: pack.sheetCount,
      sheetWidthMm,
      sheetLengthMm,
      sheetAreaM2,
      netAreaM2: totalNetM2,
      wasteAreaM2,
      utilizationPct,
      oversizeParts: pack.oversizeParts,
    };

    // Prefer a feasible pack (no oversize) over an infeasible one with fake
    // sheetCount. Among equals: fewest sheets, then least waste.
    if (
      bestResult === null ||
      candidate.oversizeParts < bestResult.oversizeParts ||
      (candidate.oversizeParts === bestResult.oversizeParts &&
        candidate.sheetCount < bestResult.sheetCount) ||
      (candidate.oversizeParts === bestResult.oversizeParts &&
        candidate.sheetCount === bestResult.sheetCount &&
        candidate.wasteAreaM2 < bestResult.wasteAreaM2)
    ) {
      bestResult = candidate;
    }
  }

  return bestResult;
}

// ---------------------------------------------------------------------------
// Public API — aggregate estimate
// ---------------------------------------------------------------------------

export function rectPackEstimate(
  parts: RectPackPart[],
  stockLines: RectPackStockLine[],
  spacingMm = DEFAULT_SPACING_MM
): RectPackResult {
  const byThickness = new Map<number, RectPackPart[]>();
  for (const p of parts) {
    const ex = byThickness.get(p.thicknessMm);
    if (ex) ex.push(p); else byThickness.set(p.thicknessMm, [p]);
  }

  const perThickness: RectPackThicknessResult[] = [];
  for (const [thicknessMm, thParts] of byThickness) {
    const r = estimateForThickness(thicknessMm, thParts, stockLines, spacingMm);
    if (r) perThickness.push(r);
  }

  const totalSheetAreaM2 = perThickness.reduce((s, r) => s + r.sheetCount * r.sheetAreaM2, 0);
  const totalNetAreaM2   = perThickness.reduce((s, r) => s + r.netAreaM2, 0);
  const totalWasteAreaM2 = Math.max(0, totalSheetAreaM2 - totalNetAreaM2);
  const estimatedSheetCount = perThickness.reduce((s, r) => s + r.sheetCount, 0);
  const utilizationPct =
    totalSheetAreaM2 > 0
      ? Math.round((totalNetAreaM2 / totalSheetAreaM2) * 1000) / 10
      : 0;

  return {
    totalSheetAreaM2:   Math.round(totalSheetAreaM2 * 100) / 100,
    totalNetAreaM2:     Math.round(totalNetAreaM2 * 100) / 100,
    totalWasteAreaM2:   Math.round(totalWasteAreaM2 * 100) / 100,
    estimatedSheetCount,
    utilizationPct,
    perThickness,
  };
}

// ---------------------------------------------------------------------------
// Placement-tracking variant (visual preview)
// ---------------------------------------------------------------------------

function layoutForThickness(
  thicknessMm: number,
  parts: RectPackPart[],
  bestLine: RectPackStockLine,
  spacing: number,
  maxSheets: number
): SheetLayout[] {
  const { sheetWidthMm, sheetLengthMm } = bestLine;
  const baseInstances = buildBaseInstances(parts);
  if (baseInstances.length === 0) return [];

  // Re-run best-combination search to find the winning sort+score+orientation
  const pack = findBestPack(baseInstances, sheetWidthMm, sheetLengthMm, spacing);
  const { binW, binH, sortMode, scoreMode } = pack;
  const sheetAreaMm2 = binW * binH;
  const totalSheetsForThickness = pack.sheetCount;

  const layouts: SheetLayout[] = [];
  let remaining: Instance[] = applySortMode(baseInstances, sortMode);
  let sheetIndex = 0;

  while (remaining.length > 0 && sheetIndex < maxSheets) {
    const { placed, remaining: next } = maxRectsOneSheet(
      remaining, binW, binH, spacing, scoreMode, true
    );
    if (placed.length === 0) break;

    const sheetNetMm2 = placed.reduce((s, p) => s + p.areaMm2, 0);
    const utilizationPct =
      sheetAreaMm2 > 0 ? Math.round((sheetNetMm2 / sheetAreaMm2) * 1000) / 10 : 0;

    layouts.push({
      thicknessMm,
      sheetWidthMm: binW,
      sheetLengthMm: binH,
      sheetIndex,
      totalSheetsForThickness,
      placements: placed.map((p) => ({ x: p.px, y: p.py, w: p.pw, h: p.ph })),
      netAreaM2: sheetNetMm2 / 1_000_000,
      utilizationPct,
    });

    sheetIndex++;
    remaining = next;
  }

  return layouts;
}

export function rectPackWithPlacements(
  parts: RectPackPart[],
  stockLines: RectPackStockLine[],
  spacingMm = DEFAULT_SPACING_MM,
  maxSheetsPerThickness = 3
): RectPackWithPlacementsResult {
  const summary = rectPackEstimate(parts, stockLines, spacingMm);

  const byThickness = new Map<number, RectPackPart[]>();
  for (const p of parts) {
    const ex = byThickness.get(p.thicknessMm);
    if (ex) ex.push(p); else byThickness.set(p.thicknessMm, [p]);
  }

  const layouts: SheetLayout[] = [];
  for (const th of summary.perThickness) {
    const thParts = byThickness.get(th.thicknessMm);
    if (!thParts) continue;
    layouts.push(
      ...layoutForThickness(
        th.thicknessMm,
        thParts,
        { sheetWidthMm: th.sheetWidthMm, sheetLengthMm: th.sheetLengthMm },
        spacingMm,
        maxSheetsPerThickness
      )
    );
  }

  return { summary, layouts };
}
