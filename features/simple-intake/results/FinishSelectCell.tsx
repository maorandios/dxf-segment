"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  type QuoteItemFinish,
  QUOTE_ITEM_FINISH_LABEL_HE,
  formatFinishLabelHe,
  normalizeQuoteItemFinish,
} from "../quoteItemCommercialOptions";

const FINISH_OPTIONS: QuoteItemFinish[] = ["BLACK", "GALVANIZED"];

/** Compact single-select finish control for final quote-list cells. */
export function FinishSelectCell({
  finish,
  disabled,
  partId,
  onChange,
}: {
  finish: QuoteItemFinish;
  disabled?: boolean;
  partId: string;
  onChange: (next: QuoteItemFinish) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = normalizeQuoteItemFinish(finish);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block min-w-[5.5rem]">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`גימור עבור ${partId}`}
        title={formatFinishLabelHe(current)}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        className="inline-flex h-8 max-w-[8.5rem] items-center gap-1 rounded-md border px-2 text-[12px] font-normal shadow-none disabled:cursor-not-allowed disabled:opacity-55"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface)",
          color: "var(--ow-text)",
        }}
      >
        <span className="min-w-0 truncate">{formatFinishLabelHe(current)}</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: "var(--ow-text-muted)" }}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="בחירת גימור"
          className="absolute z-20 mt-1 min-w-[9rem] rounded-lg border py-1 shadow-md"
          style={{
            borderColor: "var(--ow-border)",
            backgroundColor: "var(--ow-surface, #ffffff)",
            insetInlineEnd: 0,
          }}
        >
          {FINISH_OPTIONS.map((option) => {
            const selected = current === option;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-right text-[12px] hover:bg-[color-mix(in_srgb,var(--ow-surface-muted)_70%,transparent)]"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span
                  className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
                  aria-hidden
                >
                  {selected ? (
                    <Check
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--ow-accent)" }}
                    />
                  ) : null}
                </span>
                <span>{QUOTE_ITEM_FINISH_LABEL_HE[option]}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated use FinishSelectCell */
export const FinishMultiSelectCell = FinishSelectCell;
