/**
 * Adapter: final quotation → existing /api/quotes/export-pdf payload.
 */

import { getDefaultPdfCompany } from "@/features/quick-quote/lib/quotePdfPayload";
import type { QuotePdfFullPayload } from "@/features/quick-quote/lib/quotePdfPayload";
import { formatFinishLabelHe } from "../quoteItemCommercialOptions";
import { buildFinalQuotationFilename } from "./formatQuotationFilename";
import { renderExistingDxfThumbnail } from "./renderExistingDxfThumbnail";
import type {
  FinalQuotationDraft,
  FinalQuotationItemRow,
  FinalQuotationTotals,
} from "./types";

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function notesToLines(notes: string): string[] {
  const trimmed = notes.trim();
  if (!trimmed) return [];
  return trimmed.split(/\r?\n/);
}

/**
 * Build PDF request body from the same canonical rows/totals as the web screen.
 */
export async function buildFinalQuotationPdfPayload(args: {
  draft: FinalQuotationDraft;
  rows: ReadonlyArray<FinalQuotationItemRow>;
  totals: FinalQuotationTotals;
}): Promise<{
  payload: QuotePdfFullPayload & {
    document_variant?: "final_quotation";
    kpi_override?: Array<{ label: string; value: string }>;
  };
  filename: string;
}> {
  const { draft, rows, totals } = args;
  const meta = draft.metadata;
  const quoteDate = meta.quotationDate || new Date().toISOString().slice(0, 10);
  const quoteNumber =
    meta.quotationNumber.trim() || meta.projectName.trim() || "טיוטה";

  const items = [];
  for (const row of rows) {
    const thumb = await renderExistingDxfThumbnail(
      {
        geometryId: row.matchedDxfId ?? row.materialRowId,
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        available: row.geometryAvailable,
      },
      { width: 72, height: 72, padding: 0.12 }
    );

    const finishHe = formatFinishLabelHe(row.finish);
    items.push({
      part_number: row.partId,
      qty: Math.round(row.quantity),
      thickness_mm: row.thicknessMm,
      material_type: "פלדה",
      material_grade: row.material,
      finish: finishHe,
      width_mm: row.widthMm,
      length_mm: row.lengthMm,
      area_m2: 0,
      weight_kg: row.totalWeightKg,
      line_total: row.lineTotal,
      plate_shape: "flat",
      description: "",
      source_row_id: row.materialRowId,
      geometry_preview_data_uri: thumb.pngDataUrl ?? undefined,
      geometry_preview_svg: thumb.svgMarkup ?? undefined,
      price_per_kg: row.finalPricePerKg,
      is_checkered_plate: row.isCheckeredPlate,
      finish_code: row.finish,
    });
  }

  const vatRateFraction = totals.vatRatePercent / 100;
  const formatNum = (n: number, fd: number) =>
    n.toLocaleString("he-IL", {
      minimumFractionDigits: fd,
      maximumFractionDigits: fd,
    });

  const payload = {
    document_variant: "final_quotation" as const,
    company: getDefaultPdfCompany(),
    quote: {
      quote_number: quoteNumber,
      quote_date: quoteDate,
      valid_until: addDaysIso(quoteDate, 14),
      currency: "ILS",
      prepared_by: null,
      customer_name: meta.customerName.trim() || null,
      customer_company: null,
      project_name: meta.projectName.trim() || null,
      reference_number: meta.quotationNumber.trim() || null,
      scope_text: null,
      notes: notesToLines(draft.notes),
      terms: [],
    },
    summary: {
      total_parts: totals.itemCount,
      total_quantity: Math.round(totals.totalQuantity),
      total_weight_kg: totals.totalWeightKg,
      net_plate_area_m2: 0,
      gross_material_area_m2: 0,
      estimated_sheet_count: null,
    },
    items,
    pricing: {
      total_price: totals.subtotalBeforeVat,
      discount: null,
      vat_rate: vatRateFraction,
      total_incl_vat: totals.totalIncludingVat,
    },
    kpi_override: [
      { label: "מספר פריטים", value: formatNum(totals.itemCount, 0) },
      { label: "כמות כוללת", value: formatNum(totals.totalQuantity, 0) },
      { label: 'משקל כולל', value: formatNum(totals.totalWeightKg, 2) },
      {
        label: 'סה"כ לפני מע"מ',
        value: `${formatNum(totals.subtotalBeforeVat, 2)} ₪`,
      },
      {
        label: `מע"מ (${totals.vatRatePercent}%)`,
        value: `${formatNum(totals.vatAmount, 2)} ₪`,
      },
      {
        label: 'סה"כ לתשלום',
        value: `${formatNum(totals.totalIncludingVat, 2)} ₪`,
      },
    ],
  };

  const filename = buildFinalQuotationFilename({
    quotationNumber: meta.quotationNumber,
    projectName: meta.projectName,
    quotationDate: meta.quotationDate,
    extension: "pdf",
  });

  return { payload, filename };
}

export async function downloadFinalQuotationPdf(args: {
  draft: FinalQuotationDraft;
  rows: ReadonlyArray<FinalQuotationItemRow>;
  totals: FinalQuotationTotals;
}): Promise<{ ok: boolean; pageCount: number | null; error?: string }> {
  if (args.rows.length === 0) {
    return { ok: false, pageCount: null, error: "empty" };
  }
  const { payload, filename } = await buildFinalQuotationPdfPayload(args);
  try {
    const res = await fetch("/api/quotes/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, pageCount: null, error: text || res.statusText };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, pageCount: null };
  } catch (e) {
    return {
      ok: false,
      pageCount: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
