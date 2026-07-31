"use client";

import type { LucideIcon } from "lucide-react";
import { Building2, CalendarDays, FolderKanban, Hash } from "lucide-react";
import type { FinalQuotationMetadata } from "./types";

const MUTED = "var(--ow-text-muted, #667085)";
/** Same translucent shell language as metric cards (~15% surface). */
const SECTION_SURFACE =
  "color-mix(in srgb, var(--ow-surface, #ffffff) 15%, transparent)";

function FieldLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: string;
}) {
  return (
    <span
      className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium"
      dir="rtl"
      style={{ color: "var(--ow-text-secondary)" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} aria-hidden />
      {children}
    </span>
  );
}

export function FinalQuotationMetadataForm({
  metadata,
  onChange,
}: {
  metadata: FinalQuotationMetadata;
  onChange: (patch: Partial<FinalQuotationMetadata>) => void;
}) {
  const fieldClass =
    "h-10 w-full rounded-lg border bg-[var(--ow-surface,#fff)] px-3 text-right text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent)]";
  const border = { borderColor: "var(--ow-border, #e4e7ec)" };

  return (
    <section
      data-final-quotation-metadata="true"
      className="rounded-2xl border p-4"
      style={{
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor: SECTION_SURFACE,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <h2
        className="mb-3 text-[14px] font-semibold"
        style={{ color: "var(--ow-text)" }}
      >
        פרטי ההצעה
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <FieldLabel icon={Building2}>שם הלקוח</FieldLabel>
          <input
            type="text"
            dir="rtl"
            value={metadata.customerName}
            onChange={(e) => onChange({ customerName: e.target.value })}
            className={fieldClass}
            style={border}
            data-field="customerName"
          />
        </label>
        <label className="block">
          <FieldLabel icon={FolderKanban}>שם הפרויקט</FieldLabel>
          <input
            type="text"
            dir="rtl"
            value={metadata.projectName}
            onChange={(e) => onChange({ projectName: e.target.value })}
            className={fieldClass}
            style={border}
            data-field="projectName"
          />
        </label>
        <label className="block">
          <FieldLabel icon={CalendarDays}>תאריך</FieldLabel>
          <div className="relative">
            <input
              type="date"
              dir="rtl"
              value={metadata.quotationDate}
              onChange={(e) => onChange({ quotationDate: e.target.value })}
              className={[
                fieldClass,
                "relative pl-10 pr-3",
                "[color-scheme:light]",
                "[&::-webkit-datetime-edit]:m-0",
                "[&::-webkit-datetime-edit]:w-full",
                "[&::-webkit-datetime-edit]:p-0",
                "[&::-webkit-datetime-edit]:text-right",
                "[&::-webkit-datetime-edit-fields-wrapper]:ms-auto",
                "[&::-webkit-datetime-edit-fields-wrapper]:me-0",
                "[&::-webkit-datetime-edit-fields-wrapper]:p-0",
                "[&::-webkit-date-and-time-value]:w-full",
                "[&::-webkit-date-and-time-value]:text-right",
                "[&::-webkit-calendar-picker-indicator]:absolute",
                "[&::-webkit-calendar-picker-indicator]:left-3",
                "[&::-webkit-calendar-picker-indicator]:right-auto",
                "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
              ].join(" ")}
              style={{
                ...border,
                textAlign: "right",
                direction: "rtl",
              }}
              data-field="quotationDate"
            />
          </div>
        </label>
        <label className="block">
          <FieldLabel icon={Hash}>מספר הצעה</FieldLabel>
          <input
            type="text"
            dir="rtl"
            inputMode="text"
            value={metadata.quotationNumber}
            onChange={(e) => onChange({ quotationNumber: e.target.value })}
            className={fieldClass}
            style={{ ...border, textAlign: "right" }}
            placeholder="2026-0041"
            data-field="quotationNumber"
          />
        </label>
      </div>
    </section>
  );
}
