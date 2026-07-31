#!/usr/bin/env python3
"""
Render OMEGA Simple Intake final quotation PDF (matches סיכום הצעת מחיר screen).

Usage:
  python render_final_quotation_pdf.py --input payload.json --output quote.pdf
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from final_quotation_pdf_types import FinalQuotationPdfPayload
from quote_pdf_formatters import format_currency, format_date_il, format_qty

DIR = Path(__file__).resolve().parent


def _fmt_num(value: float, fraction_digits: int) -> str:
    q = round(float(value), fraction_digits)
    if fraction_digits == 0:
        return f"{int(round(q)):,}".replace(",", ",")
    return f"{q:,.{fraction_digits}f}"


def _fmt_weight(value: float) -> str:
    return f"{round(float(value), 2):,.2f}"


def build_template_context(payload: FinalQuotationPdfPayload) -> dict:
    meta = payload.metadata
    totals = payload.totals
    cur = "ILS"

    def money(v: float) -> str:
        return format_currency(v, cur)

    kpi_cards = [
        {
            "label": "מספר פריטים",
            "value": format_qty(totals.item_count),
            "badge": "פריטים פעילים",
        },
        {
            "label": "כמות כוללת",
            "value": format_qty(int(round(totals.total_quantity))),
            "badge": "סכום כמויות",
        },
        {
            "label": "משקל כולל",
            "value": _fmt_weight(totals.total_weight_kg),
            "badge": "ק״ג",
        },
        {
            "label": "סה״כ לפני מע״מ",
            "value": money(totals.subtotal_before_vat),
            "badge": "לפני מע״מ",
        },
        {
            "label": f"מע״מ ({_fmt_num(totals.vat_rate_percent, 0)}%)",
            "value": money(totals.vat_amount),
            "badge": "מע״מ",
        },
        {
            "label": "סה״כ לתשלום",
            "value": money(totals.total_including_vat),
            "badge": "כולל מע״מ",
        },
    ]

    item_rows = []
    for i, row in enumerate(payload.rows, start=1):
        item_rows.append(
            {
                "index": format_qty(i),
                "part_id": row.part_id,
                "thickness": _fmt_num(row.thickness_mm, 0),
                "quantity": format_qty(int(round(row.quantity))),
                "material": row.material,
                "length": _fmt_num(row.length_mm, 0),
                "width": _fmt_num(row.width_mm, 0),
                "weight": _fmt_weight(row.total_weight_kg),
                "finish": row.finish,
                "checkered": "כן" if row.is_checkered_plate else "לא",
                "price_per_kg": money(row.final_price_per_kg),
                "line_total": money(row.line_total),
            }
        )

    notes_text = (payload.notes or "").strip()
    css_text = (DIR / "final_quotation_template.css").read_text(encoding="utf-8")

    def format_meta_date(raw: str) -> str:
        value = (raw or "").strip()
        if not value:
            return "—"
        try:
            return format_date_il(value)
        except Exception:
            return value

    return {
        "css_text": css_text,
        "customer_name": meta.customer_name.strip() or "—",
        "project_name": meta.project_name.strip() or "—",
        "quotation_date": format_meta_date(meta.quotation_date),
        "quotation_validity_date": format_meta_date(meta.quotation_validity_date),
        "quotation_number": meta.quotation_number.strip() or "—",
        "kpi_cards": kpi_cards,
        "item_rows": item_rows,
        "notes_text": notes_text,
        "company_name": payload.company.name.strip() or "—",
        "company_email": (payload.company.email or "").strip() or "—",
        "company_address": (payload.company.address or "").strip() or "—",
        "company_registration": (payload.company.registration_number or "").strip()
        or "—",
    }


def render_html(payload: FinalQuotationPdfPayload) -> str:
    env = Environment(
        loader=FileSystemLoader(str(DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    tpl = env.get_template("final_quotation_template.html")
    return tpl.render(**build_template_context(payload))


async def html_to_pdf_bytes(html: str) -> bytes:
    """Render HTML → PDF without waiting on external network (fonts/CDN)."""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ],
        )
        try:
            page = await browser.new_page()
            # Offline render: Google Fonts / CDN waits were causing 30–60s hangs
            # and failed retries when networkidle never settled.
            await page.route(
                "**/*",
                lambda route: (
                    route.abort()
                    if route.request.url.startswith(("http://", "https://"))
                    else route.continue_()
                ),
            )
            await page.set_content(html, wait_until="domcontentloaded", timeout=15_000)
            # Prefer CSS @page margin (20mm) so inset repeats on every page.
            # Also pass matching PDF margins as a fallback.
            return await page.pdf(
                format="A4",
                landscape=False,
                print_background=True,
                prefer_css_page_size=True,
                margin={
                    "top": "20mm",
                    "right": "20mm",
                    "bottom": "20mm",
                    "left": "20mm",
                },
            )
        finally:
            await browser.close()


def render_pdf_bytes(payload: FinalQuotationPdfPayload) -> bytes:
    return asyncio.run(html_to_pdf_bytes(render_html(payload)))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    raw = Path(args.input).read_text(encoding="utf-8")
    payload = FinalQuotationPdfPayload.model_validate(json.loads(raw))
    pdf = render_pdf_bytes(payload)
    Path(args.output).write_bytes(pdf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
