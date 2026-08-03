/**
 * Build final-quotation HTML (same templates as the Python Playwright path).
 */

import fs from "node:fs";
import path from "node:path";
import nunjucks from "nunjucks";

export type FinalQuotationPdfPayload = {
  metadata: {
    customer_name: string;
    project_name: string;
    quotation_date: string;
    quotation_validity_date?: string;
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
  notes?: string;
  company: {
    name: string;
    email?: string;
    address?: string;
    registration_number?: string;
  };
};

function fmtNum(value: number, fractionDigits: number): string {
  const q = Number(value.toFixed(fractionDigits));
  if (fractionDigits === 0) {
    return Math.round(q).toLocaleString("en-US");
  }
  return q.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function fmtQty(n: number): string {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

function fmtWeight(value: number): string {
  return Number(value.toFixed(2)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtMoney(value: number): string {
  const s = Number(value.toFixed(2)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₪${s}`;
}

function fmtDateIl(raw: string): string {
  const v = (raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v || "—";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

function dash(v: string | undefined | null): string {
  const t = (v ?? "").trim();
  return t || "—";
}

export function buildFinalQuotationHtml(
  payload: FinalQuotationPdfPayload
): string {
  const pdfDir = path.join(process.cwd(), "server", "pdf");
  const cssText = fs.readFileSync(
    path.join(pdfDir, "final_quotation_template.css"),
    "utf8"
  );
  const meta = payload.metadata;
  const totals = payload.totals;

  const kpiCards = [
    { label: "מספר פריטים", value: fmtQty(totals.item_count) },
    {
      label: "כמות כוללת",
      value: fmtQty(Math.round(totals.total_quantity)),
    },
    { label: 'משקל (ק״ג)', value: fmtWeight(totals.total_weight_kg) },
    { label: 'לפני מע״מ', value: fmtMoney(totals.subtotal_before_vat) },
    {
      label: `מע״מ (${fmtNum(totals.vat_rate_percent, 0)}%)`,
      value: fmtMoney(totals.vat_amount),
    },
    { label: 'סה״כ לתשלום', value: fmtMoney(totals.total_including_vat) },
  ];

  const itemRows = payload.rows.map((row, i) => ({
    index: fmtQty(i + 1),
    part_id: row.part_id,
    thickness: fmtNum(row.thickness_mm, 0),
    quantity: fmtQty(Math.round(row.quantity)),
    material: row.material,
    length: fmtNum(row.length_mm, 0),
    width: fmtNum(row.width_mm, 0),
    weight: fmtWeight(row.total_weight_kg),
    finish: row.finish,
    checkered: row.is_checkered_plate ? "כן" : "לא",
    price_per_kg: fmtMoney(row.final_price_per_kg),
    line_total: fmtMoney(row.line_total),
  }));

  const env = nunjucks.configure(pdfDir, {
    autoescape: true,
    noCache: true,
  });

  return env.render("final_quotation_template.html", {
    css_text: cssText,
    customer_name: dash(meta.customer_name),
    project_name: dash(meta.project_name),
    quotation_date: fmtDateIl(meta.quotation_date),
    quotation_validity_date: fmtDateIl(meta.quotation_validity_date ?? ""),
    quotation_number: dash(meta.quotation_number),
    kpi_cards: kpiCards,
    item_rows: itemRows,
    notes_text: (payload.notes || "").trim(),
    company_name: dash(payload.company.name),
    company_email: dash(payload.company.email),
    company_address: dash(payload.company.address),
    company_registration: dash(payload.company.registration_number),
  });
}
