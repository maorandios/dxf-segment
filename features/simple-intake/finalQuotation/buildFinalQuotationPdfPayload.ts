/**
 * Final quotation → OMEGA Simple Intake PDF (matches סיכום הצעת מחיר screen).
 * Does not use the Quick Quote dark-header template.
 */

import { getDefaultPdfCompany } from "@/features/quick-quote/lib/quotePdfPayload";
import { formatFinishLabelHe } from "../quoteItemCommercialOptions";
import { buildFinalQuotationFilename } from "./formatQuotationFilename";
import type {
  FinalQuotationDraft,
  FinalQuotationItemRow,
  FinalQuotationTotals,
} from "./types";

export type FinalQuotationPdfApiPayload = {
  metadata: {
    customer_name: string;
    project_name: string;
    quotation_date: string;
    quotation_number: string;
  };
  totals: {
    item_count: number;
    total_quantity: number;
    total_weight_kg: number;
    subtotal_before_vat: number;
    vat_rate_percent: number;
    vat_amount: number;
    total_including_vat: number;
  };
  rows: Array<{
    part_id: string;
    thickness_mm: number;
    quantity: number;
    material: string;
    length_mm: number;
    width_mm: number;
    total_weight_kg: number;
    finish: string;
    is_checkered_plate: boolean;
    final_price_per_kg: number;
    line_total: number;
  }>;
  notes: string;
  company: { name: string };
};

export function buildFinalQuotationPdfPayload(args: {
  draft: FinalQuotationDraft;
  rows: ReadonlyArray<FinalQuotationItemRow>;
  totals: FinalQuotationTotals;
}): { payload: FinalQuotationPdfApiPayload; filename: string } {
  const { draft, rows, totals } = args;
  const meta = draft.metadata;
  const company = getDefaultPdfCompany();

  const payload: FinalQuotationPdfApiPayload = {
    metadata: {
      customer_name: meta.customerName,
      project_name: meta.projectName,
      quotation_date: meta.quotationDate,
      quotation_number: meta.quotationNumber,
    },
    totals: {
      item_count: totals.itemCount,
      total_quantity: totals.totalQuantity,
      total_weight_kg: totals.totalWeightKg,
      subtotal_before_vat: totals.subtotalBeforeVat,
      vat_rate_percent: totals.vatRatePercent,
      vat_amount: totals.vatAmount,
      total_including_vat: totals.totalIncludingVat,
    },
    rows: rows.map((row) => ({
      part_id: row.partId,
      thickness_mm: row.thicknessMm,
      quantity: row.quantity,
      material: row.material,
      length_mm: row.lengthMm,
      width_mm: row.widthMm,
      total_weight_kg: row.totalWeightKg,
      finish: formatFinishLabelHe(row.finish),
      is_checkered_plate: row.isCheckeredPlate,
      final_price_per_kg: row.finalPricePerKg,
      line_total: row.lineTotal,
    })),
    notes: draft.notes.trim(),
    company: {
      name: company.name.trim() || "OMEGA",
    },
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
  const { payload, filename } = buildFinalQuotationPdfPayload(args);
  try {
    const res = await fetch("/api/simple-intake/export-quotation-pdf", {
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
