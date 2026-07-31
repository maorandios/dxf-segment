"""Structured payload for customer-facing quotation PDF generation."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class CompanyBlock(BaseModel):
    name: str = Field(..., min_length=1)
    logo_path: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None


class QuoteBlock(BaseModel):
    quote_number: str = Field(..., min_length=1)
    quote_date: str = Field(..., description="ISO date YYYY-MM-DD or display-ready string")
    valid_until: str = Field(..., min_length=1)
    currency: str = Field(..., min_length=1)
    prepared_by: str | None = None
    customer_name: str | None = None
    customer_company: str | None = None
    project_name: str | None = None
    reference_number: str | None = None
    scope_text: str | None = None
    notes: list[str] = Field(default_factory=list)
    terms: list[str] = Field(default_factory=list)

    @field_validator("notes", "terms", mode="before")
    @classmethod
    def _coerce_str_list(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [v] if v.strip() else []
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []


class SummaryBlock(BaseModel):
    total_parts: int = Field(..., ge=0)
    total_quantity: int = Field(..., ge=0)
    total_weight_kg: float = Field(..., ge=0)
    net_plate_area_m2: float = Field(..., ge=0)
    gross_material_area_m2: float = Field(..., ge=0)
    estimated_sheet_count: int | None = Field(default=None, ge=0)


class LineItem(BaseModel):
    part_number: str = Field(..., min_length=1)
    qty: int = Field(..., ge=0)
    thickness_mm: float = 0
    material_type: str = ""
    material_grade: str = ""
    finish: str = ""
    width_mm: float = 0
    length_mm: float = 0
    area_m2: float = 0
    weight_kg: float = Field(..., ge=0, description="Line total weight (e.g. unit × qty)")
    line_total: float = Field(..., ge=0)
    plate_shape: str = Field(default="flat")
    description: str = Field(
        default="",
        description="Hebrew plate-type label (finalize תיאור), e.g. סטנדרט / זוית.",
    )


class PricingBlock(BaseModel):
    total_price: float = Field(..., ge=0)
    discount: float | None = Field(default=None, ge=0)
    vat_rate: float = Field(..., ge=0, le=1)
    total_incl_vat: float = Field(..., ge=0)

    @field_validator("discount", mode="before")
    @classmethod
    def _empty_discount(cls, v: Any) -> float | None:
        if v is None or v == "":
            return None
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return f if f > 0 else None


class QuotePdfPayload(BaseModel):
    company: CompanyBlock
    quote: QuoteBlock
    summary: SummaryBlock
    items: list[LineItem]
    pricing: PricingBlock

    @field_validator("items", mode="before")
    @classmethod
    def _items_nonempty(cls, v: Any) -> list[Any]:
        if not v:
            raise ValueError("items must contain at least one line")
        return v
