"use client";

import {
  FINAL_QUOTATION_NOTES_PLACEHOLDER,
  NEW_QUOTATION_NOTES_DEFAULT,
} from "./types";

export function FinalQuotationNotes({
  notes,
  onChange,
}: {
  notes: string;
  onChange: (notes: string) => void;
}) {
  return (
    <section
      data-final-quotation-notes="true"
      className="rounded-2xl border p-4"
      style={{
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor:
          "color-mix(in srgb, var(--ow-surface, #ffffff) 15%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <h2
        className="mb-2 text-[14px] font-semibold"
        style={{ color: "var(--ow-text)" }}
      >
        הערות להצעה
      </h2>
      <textarea
        dir="rtl"
        rows={4}
        value={notes}
        defaultValue={undefined}
        placeholder={FINAL_QUOTATION_NOTES_PLACEHOLDER}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-lg border bg-[var(--ow-surface,#fff)] px-3 py-2 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent)]"
        style={{
          borderColor: "var(--ow-border, #e4e7ec)",
          color: "var(--ow-text)",
          minHeight: "6rem",
        }}
        data-field="notes"
        data-notes-default={NEW_QUOTATION_NOTES_DEFAULT}
        aria-label="הערות להצעה"
      />
    </section>
  );
}
