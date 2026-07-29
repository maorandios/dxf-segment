/**
 * Quotation-level commercial options (finish + checkered plate).
 * Orthogonal to extraction / DXF matching / freeze scope / physical metrics.
 */

export type QuoteItemFinish = "BLACK" | "GALVANIZED";

export type QuoteItemCommercialOptions = {
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
};

/** Legacy session shape (v2 multi-select). */
export type LegacyQuoteItemCommercialOptions = {
  finishes?: QuoteItemFinish[];
  finish?: QuoteItemFinish;
  isCheckeredPlate?: boolean;
};

/** Session map: materialRowId → commercial options. */
export type QuoteItemCommercialOptionsMap = Record<
  string,
  QuoteItemCommercialOptions
>;

export const DEFAULT_QUOTE_ITEM_FINISH: QuoteItemFinish = "BLACK";

export const QUOTE_ITEM_FINISH_LABEL_HE: Record<QuoteItemFinish, string> = {
  BLACK: "שחור",
  GALVANIZED: "מגולוון",
};

export function defaultQuoteItemCommercialOptions(): QuoteItemCommercialOptions {
  return {
    finish: DEFAULT_QUOTE_ITEM_FINISH,
    isCheckeredPlate: false,
  };
}

/**
 * Normalize scalar or legacy array finish values to exactly one finish.
 * Both BLACK+GALVANIZED → BLACK (deterministic fallback; no selection metadata).
 */
export function normalizeQuoteItemFinish(
  value: QuoteItemFinish | ReadonlyArray<QuoteItemFinish> | null | undefined
): QuoteItemFinish {
  if (value == null) return DEFAULT_QUOTE_ITEM_FINISH;
  if (typeof value === "string") {
    if (value === "GALVANIZED") return "GALVANIZED";
    if (value === "BLACK") return "BLACK";
    return DEFAULT_QUOTE_ITEM_FINISH;
  }
  const list = value.filter(
    (f): f is QuoteItemFinish => f === "BLACK" || f === "GALVANIZED"
  );
  if (list.length === 0) return DEFAULT_QUOTE_ITEM_FINISH;
  if (list.length === 1) return list[0]!;
  // Legacy multi-select with both — deterministic fallback.
  return DEFAULT_QUOTE_ITEM_FINISH;
}

export function hydrateQuoteItemCommercialOptions(
  value:
    | QuoteItemCommercialOptions
    | LegacyQuoteItemCommercialOptions
    | null
    | undefined
): QuoteItemCommercialOptions {
  const finish = normalizeQuoteItemFinish(
    value?.finish ??
      (value as LegacyQuoteItemCommercialOptions | null | undefined)?.finishes
  );
  return {
    finish,
    isCheckeredPlate: value?.isCheckeredPlate === true,
  };
}

export function formatFinishLabelHe(finish: QuoteItemFinish): string {
  return QUOTE_ITEM_FINISH_LABEL_HE[normalizeQuoteItemFinish(finish)];
}

/** @deprecated use formatFinishLabelHe */
export function formatFinishesLabelHe(
  finishes: QuoteItemFinish | ReadonlyArray<QuoteItemFinish>
): string {
  return formatFinishLabelHe(normalizeQuoteItemFinish(finishes));
}

export function formatCheckeredPlateExportHe(value: boolean): string {
  return value ? "כן" : "לא";
}

export function resolveCommercialOptionsForRow(
  map: QuoteItemCommercialOptionsMap | null | undefined,
  materialRowId: string
): QuoteItemCommercialOptions {
  return hydrateQuoteItemCommercialOptions(map?.[materialRowId]);
}

/** @deprecated multi-select removed — kept for migration callers */
export function normalizeFinishes(
  finishes: ReadonlyArray<QuoteItemFinish> | null | undefined
): QuoteItemFinish[] {
  return [normalizeQuoteItemFinish(finishes)];
}

/** @deprecated multi-select removed */
export function toggleQuoteItemFinish(
  _current: ReadonlyArray<QuoteItemFinish>,
  finish: QuoteItemFinish
): QuoteItemFinish[] {
  return [normalizeQuoteItemFinish(finish)];
}
