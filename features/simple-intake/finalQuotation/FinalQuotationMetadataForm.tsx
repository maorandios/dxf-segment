"use client";

import type { FinalQuotationMetadata } from "./types";

export function FinalQuotationMetadataForm({
  metadata,
  onChange,
}: {
  metadata: FinalQuotationMetadata;
  onChange: (patch: Partial<FinalQuotationMetadata>) => void;
}) {
  const fieldClass =
    "h-10 w-full rounded-lg border bg-[var(--ow-surface,#fff)] px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent)]";
  const labelClass = "mb-1 block text-[12px] font-medium";
  const border = { borderColor: "var(--ow-border, #e4e7ec)" };
  const labelColor = { color: "var(--ow-text-secondary)" };

  return (
    <section
      data-final-quotation-metadata="true"
      className="rounded-2xl border p-4"
      style={{
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor: "var(--ow-surface, #ffffff)",
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
          <span className={labelClass} style={labelColor}>
            שם הלקוח
          </span>
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
          <span className={labelClass} style={labelColor}>
            שם הפרויקט
          </span>
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
          <span className={labelClass} style={labelColor}>
            תאריך
          </span>
          <input
            type="date"
            dir="ltr"
            value={metadata.quotationDate}
            onChange={(e) => onChange({ quotationDate: e.target.value })}
            className={fieldClass}
            style={border}
            data-field="quotationDate"
          />
        </label>
        <label className="block">
          <span className={labelClass} style={labelColor}>
            מספר הצעה
          </span>
          <input
            type="text"
            dir="ltr"
            inputMode="text"
            value={metadata.quotationNumber}
            onChange={(e) => onChange({ quotationNumber: e.target.value })}
            className={fieldClass}
            style={border}
            placeholder="2026-0041"
            data-field="quotationNumber"
          />
        </label>
      </div>
    </section>
  );
}
