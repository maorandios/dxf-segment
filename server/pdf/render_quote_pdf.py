#!/usr/bin/env python3
"""
Render customer quotation PDF from JSON payload using Jinja2 + Playwright (Chromium).

Usage:
  python render_quote_pdf.py --input payload.json --output quote.pdf
  python render_quote_pdf.py --sample [--output quote-sample.pdf]
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import mimetypes
import sys
from datetime import date, timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from quote_pdf_formatters import (
    format_currency,
    format_date_il,
    format_int_space,
    format_kg,
    format_m2,
    format_mm_one_he,
    format_qty,
    format_thickness_mm_he,
)
from quote_pdf_types import QuotePdfPayload

DIR = Path(__file__).resolve().parent

def _logo_data_uri(logo_path: str | None) -> str | None:
    if not logo_path:
        return None
    p = Path(logo_path).expanduser().resolve()
    if not p.is_file():
        return None
    mime, _ = mimetypes.guess_type(str(p))
    if mime not in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"):
        mime = "image/png"
    data = base64.standard_b64encode(p.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def build_template_context(payload: QuotePdfPayload) -> dict:
    q = payload.quote
    cur = q.currency.strip()
    cc = payload.company
    pr = payload.pricing

    area_sum_lines = sum(float(it.area_m2) for it in payload.items)

    kpi_cards = [
        {"label": "סוגי פלטות", "value": format_int_space(payload.summary.total_parts)},
        {"label": "כמות פלטות", "value": format_qty(payload.summary.total_quantity)},
        {"label": "שטח (מ״ר)", "value": format_m2(area_sum_lines)},
        {"label": "משקל (ק״ג)", "value": format_kg(payload.summary.total_weight_kg)},
        {"label": "הצעת מחיר", "value": format_currency(pr.total_price, cur)},
    ]

    technical_rows = [
        {"label": "שטח נטו (לפי מערכת)", "value": format_m2(payload.summary.net_plate_area_m2)},
        {
            "label": "שטח חומר גלם משוער",
            "value": format_m2(payload.summary.gross_material_area_m2),
        },
    ]
    if payload.summary.estimated_sheet_count is not None:
        technical_rows.append(
            {
                "label": "מספר לוחות משוער",
                "value": format_int_space(int(payload.summary.estimated_sheet_count)),
            }
        )

    scope_text = (q.scope_text or "").strip()
    scope_has = bool(scope_text)

    item_rows = []
    for it in payload.items:
        desc = (it.description or "").strip() or "—"
        item_rows.append(
            {
                "description": desc,
                "part_number": it.part_number,
                "qty": format_qty(it.qty),
                "thickness": format_thickness_mm_he(it.thickness_mm) if it.thickness_mm else "—",
                "material_type": (it.material_type or "").strip() or "—",
                "material_grade": (it.material_grade or "").strip() or "—",
                "finish": (it.finish or "").strip() or "—",
                "width_mm": format_mm_one_he(it.width_mm) if it.width_mm else "—",
                "length_mm": format_mm_one_he(it.length_mm) if it.length_mm else "—",
                "area_m2": format_m2(it.area_m2) if it.area_m2 else "—",
                "weight": format_kg(it.weight_kg),
                "line_total": format_currency(it.line_total, cur),
            }
        )

    discount_fmt = format_currency(pr.discount, cur) if pr.discount else None
    net = max(0.0, float(pr.total_price) - (float(pr.discount) if pr.discount else 0.0))
    vat_rate = float(pr.vat_rate)
    vat_amount = round(net * vat_rate, 2)
    vat_pct = int(round(vat_rate * 100))
    pricing_vat_label = f"מע״מ ({vat_pct}%)"

    raw_notes = list(q.notes) if q.notes else []
    notes_lines = [str(x).strip() for x in raw_notes if str(x).strip()]
    raw_terms = list(q.terms) if q.terms else []
    terms_lines = [str(x).strip() for x in raw_terms if str(x).strip()]

    css_text = (DIR / "quote_template.css").read_text(encoding="utf-8")

    addr_raw = (cc.address or "").strip()
    company_address_lines = [x.strip() for x in addr_raw.splitlines() if x.strip()]

    return {
        "css_text": css_text,
        "logo_data_uri": _logo_data_uri(cc.logo_path),
        "company_name": cc.name,
        "company_email": cc.email or "",
        "company_phone": cc.phone or "",
        "company_website": cc.website or "",
        "company_address_lines": company_address_lines,
        "quote_number": q.quote_number,
        "quote_date": format_date_il(q.quote_date),
        "valid_until": format_date_il(q.valid_until),
        "customer_name": q.customer_name or "",
        "customer_company": q.customer_company or "",
        "project_name": q.project_name or "",
        "reference_number": q.reference_number or "",
        "currency": cur,
        "prepared_by": q.prepared_by or "",
        "kpi_cards": kpi_cards,
        "technical_rows": technical_rows,
        "scope_has": scope_has,
        "scope_text": scope_text,
        "item_rows": item_rows,
        "pricing_subtotal": format_currency(pr.total_price, cur),
        "pricing_discount": discount_fmt,
        "pricing_net_after_discount": format_currency(net, cur),
        "pricing_vat_label": pricing_vat_label,
        "pricing_vat_amount": format_currency(vat_amount, cur),
        "pricing_total_incl_vat": format_currency(pr.total_incl_vat, cur),
        "has_discount": pr.discount is not None and float(pr.discount) > 0,
        "notes_lines": notes_lines,
        "terms_lines": terms_lines,
        "footer_generated": "מסמך הופק אלקטרונית · ללא חתימה ידנית.",
    }


def render_html(payload: QuotePdfPayload) -> str:
    env = Environment(
        loader=FileSystemLoader(str(DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    tpl = env.get_template("quote_template.html")
    ctx = build_template_context(payload)
    return tpl.render(**ctx)


async def html_to_pdf_bytes(html: str) -> bytes:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="networkidle", timeout=60_000)
            pdf = await page.pdf(
                format="A4",
                landscape=False,
                print_background=True,
                # Let Playwright/Chromium apply margins below (CSS @page alone is unreliable here).
                prefer_css_page_size=False,
                # Standard print margins (~1 in / 2.5 cm), common for A4 business documents.
                margin={
                    "top": "25mm",
                    "right": "25mm",
                    "bottom": "25mm",
                    "left": "25mm",
                },
            )
            return pdf
        finally:
            await browser.close()


def render_pdf_bytes(payload: QuotePdfPayload) -> bytes:
    html = render_html(payload)
    return asyncio.run(html_to_pdf_bytes(html))


def sample_payload() -> QuotePdfPayload:
    today = date.today()
    valid = today + timedelta(days=14)
    return QuotePdfPayload(
        company={
            "name": "Acme Fabrication Ltd.",
            "logo_path": str(DIR / "assets" / "logo.png") if (DIR / "assets" / "logo.png").is_file() else None,
            "email": "quotes@acmefab.example",
            "phone": "+1 (555) 010-0200",
            "website": "www.acmefab.example",
            "address": "100 Industrial Way\nSheffield, S1 2AB\nUnited Kingdom",
        },
        quote={
            "quote_number": "QQ-20260327-SAMPLE",
            "quote_date": today.isoformat(),
            "valid_until": valid.isoformat(),
            "currency": "EUR",
            "prepared_by": "Sales Desk",
            "customer_name": "Jane Smith",
            "customer_company": "Northwind Structures",
            "project_name": "Platform deck plates",
            "reference_number": "REF-NW-1042",
            "scope_text": "",
            "notes": [],
            "terms": [],
        },
        summary={
            "total_parts": 3,
            "total_quantity": 24,
            "total_weight_kg": 1443.8,
            "net_plate_area_m2": 18.44,
            "gross_material_area_m2": 31.79,
            "estimated_sheet_count": 8,
        },
        items=[
            {
                "part_number": "PL-001-A",
                "qty": 6,
                "thickness_mm": 12,
                "material_type": "Structural steel plate (EN 10025)",
                "material_grade": "S355JR",
                "finish": "Carbon",
                "width_mm": 800,
                "length_mm": 1200,
                "area_m2": 5.76,
                "weight_kg": 543.6,
                "line_total": 4200.0,
                "plate_shape": "flat",
            },
            {
                "part_number": "PL-002-B",
                "qty": 10,
                "thickness_mm": 10,
                "material_type": "Structural steel plate (EN 10025)",
                "material_grade": "S355JR",
                "finish": "Carbon",
                "width_mm": 640,
                "length_mm": 980,
                "area_m2": 6.27,
                "weight_kg": 490.2,
                "line_total": 3100.0,
                "plate_shape": "flat",
            },
            {
                "part_number": "PL-003-C",
                "qty": 8,
                "thickness_mm": 8,
                "material_type": "Structural steel plate (EN 10025)",
                "material_grade": "S235JR",
                "finish": "Carbon",
                "width_mm": 400,
                "length_mm": 600,
                "area_m2": 1.92,
                "weight_kg": 120.0,
                "line_total": 980.5,
                "plate_shape": "flat",
            },
        ],
        pricing={
            "total_price": 8280.5,
            "discount": None,
            "vat_rate": 0.18,
            "total_incl_vat": round(8280.5 * 1.18 * 100) / 100,
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Render quotation PDF via Playwright")
    parser.add_argument("--input", "-i", help="Path to JSON payload file")
    parser.add_argument("--output", "-o", help="Output PDF path")
    parser.add_argument("--sample", action="store_true", help="Use built-in sample data")
    args = parser.parse_args()

    if args.sample:
        payload = sample_payload()
        out = Path(args.output or "quote-sample.pdf")
    elif args.input:
        raw = Path(args.input).read_text(encoding="utf-8")
        payload = QuotePdfPayload.model_validate(json.loads(raw))
        out = Path(args.output or "quote.pdf")
    else:
        parser.print_help()
        return 2

    pdf = render_pdf_bytes(payload)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(pdf)
    print(str(out.resolve()), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
