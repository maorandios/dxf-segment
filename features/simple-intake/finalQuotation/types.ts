/**
 * Final quotation summary — types for draft, rows, totals, diagnostics.
 */

import type { QuoteItemFinish } from "../quoteItemCommercialOptions";

export type FinalQuotationMetadata = {
  customerName: string;
  projectName: string;
  /** ISO date YYYY-MM-DD (local date when first created). */
  quotationDate: string;
  /** ISO date YYYY-MM-DD — offer validity; defaults to quotation date + 7 days. */
  quotationValidityDate: string;
  /** Free-text quotation number (preserves leading zeroes). */
  quotationNumber: string;
};

export type FinalQuotationDraft = {
  quotationId: string;
  metadata: FinalQuotationMetadata;
  vatRatePercent: number;
  notes: string;
  updatedAt: string;
};

export type FinalQuotationItemRow = {
  materialRowId: string;
  resultRowId: string;
  partId: string;
  matchedDxfId: string | null;
  dxfFilename: string;
  thicknessMm: number;
  quantity: number;
  material: string;
  lengthMm: number;
  widthMm: number;
  unitWeightKg: number;
  totalWeightKg: number;
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
  finalPricePerKg: number;
  lineTotal: number;
  geometryAvailable: boolean;
};

export type FinalQuotationTotals = {
  itemCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  subtotalBeforeVat: number;
  vatRatePercent: number;
  vatAmount: number;
  totalIncludingVat: number;
};

export type FinalQuotationDiagnostics = {
  quotationId: string;
  finalRowCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  subtotalBeforeVat: number;
  vatRatePercent: number;
  vatAmount: number;
  totalIncludingVat: number;
  rowsMissingGeometryPreview: number;
  rowsMissingFinalPrice: number;
  frozenRowsIncluded: number;
  nonMemberRowsIncluded: number;
  webExportRowCount: number;
  pdfExportRowCount: number;
  excelExportRowCount: number;
  pdfPageCount: number | null;
  excelWorksheetCount: number;
  notesLength: number;
  placeholderExportedAsNotes: boolean;
  finalScreenDxfParseCount: number;
  finalScreenAiCallCount: number;
  summaryRenderedAboveTable: boolean;
};

export const DEFAULT_VAT_RATE_PERCENT = 18;
export const NEW_QUOTATION_NOTES_DEFAULT = "" as const;
export const QUOTATION_SUMMARY_RENDERED_ABOVE_TABLE = true as const;
export const QUOTATION_SUMMARY_RENDERED_BELOW_TABLE = false as const;
export const FINAL_SCREEN_TRIGGERS_DXF_PARSE = false as const;
export const PLACEHOLDER_TEXT_EXPORTED_AS_NOTES = false as const;

export const FINAL_QUOTATION_NOTES_PLACEHOLDER =
  "לדוגמה: אספקת החומר תתבצע תוך 7 ימי עסקים";

export function todayLocalIsoDate(): string {
  return localIsoDateFromDate(new Date());
}

/** Local calendar date + N days as YYYY-MM-DD. */
export function addDaysLocalIsoDate(days: number, from: Date = new Date()): string {
  const d = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + days
  );
  return localIsoDateFromDate(d);
}

function localIsoDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Default offer validity: one week after the quotation date (or today). */
export function defaultQuotationValidityDate(
  quotationDate?: string | null
): string {
  if (quotationDate && /^\d{4}-\d{2}-\d{2}$/.test(quotationDate.trim())) {
    const [y, m, d] = quotationDate.trim().split("-").map(Number);
    return addDaysLocalIsoDate(7, new Date(y!, m! - 1, d!));
  }
  return addDaysLocalIsoDate(7);
}

export function createEmptyFinalQuotationDraft(
  quotationId: string,
  seed?: Partial<FinalQuotationMetadata>
): FinalQuotationDraft {
  const quotationDate = seed?.quotationDate ?? todayLocalIsoDate();
  return {
    quotationId,
    metadata: {
      customerName: seed?.customerName ?? "",
      projectName: seed?.projectName ?? "",
      quotationDate,
      quotationValidityDate:
        seed?.quotationValidityDate ??
        defaultQuotationValidityDate(quotationDate),
      quotationNumber: seed?.quotationNumber ?? "",
    },
    vatRatePercent: DEFAULT_VAT_RATE_PERCENT,
    notes: NEW_QUOTATION_NOTES_DEFAULT,
    updatedAt: new Date().toISOString(),
  };
}

/** Fill missing validity date on drafts persisted before this field existed. */
export function normalizeFinalQuotationDraft(
  draft: FinalQuotationDraft
): FinalQuotationDraft {
  const validity = draft.metadata.quotationValidityDate?.trim();
  if (validity && /^\d{4}-\d{2}-\d{2}$/.test(validity)) {
    return draft;
  }
  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      quotationValidityDate: defaultQuotationValidityDate(
        draft.metadata.quotationDate
      ),
    },
  };
}
