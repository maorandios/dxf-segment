"""Pydantic payload for OMEGA Simple Intake final quotation PDF."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class FinalQuotationPdfMetadata(BaseModel):
    customer_name: str = ""
    project_name: str = ""
    quotation_date: str = ""
    quotation_validity_date: str = ""
    quotation_number: str = ""


class FinalQuotationPdfTotals(BaseModel):
    item_count: int = Field(..., ge=0)
    total_quantity: float = Field(..., ge=0)
    total_weight_kg: float = Field(..., ge=0)
    subtotal_before_vat: float = Field(..., ge=0)
    vat_rate_percent: float = Field(..., ge=0)
    vat_amount: float = Field(..., ge=0)
    total_including_vat: float = Field(..., ge=0)


class FinalQuotationPdfRow(BaseModel):
    part_id: str
    thickness_mm: float
    quantity: float
    material: str
    length_mm: float
    width_mm: float
    total_weight_kg: float
    finish: str
    is_checkered_plate: bool
    final_price_per_kg: float
    line_total: float


class FinalQuotationPdfCompany(BaseModel):
    name: str = Field(..., min_length=1)
    email: str = ""
    address: str = ""
    # Company registration / ח.פ (optional).
    registration_number: str = ""


class FinalQuotationPdfPayload(BaseModel):
    metadata: FinalQuotationPdfMetadata
    totals: FinalQuotationPdfTotals
    rows: list[FinalQuotationPdfRow]
    notes: str = ""
    company: FinalQuotationPdfCompany

    @field_validator("rows", mode="before")
    @classmethod
    def _rows_nonempty(cls, v: Any) -> list[Any]:
        if not v:
            raise ValueError("rows must contain at least one line")
        return v
