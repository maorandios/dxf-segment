"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  validateQuoteFieldEdit,
  type QuoteEditField,
} from "../quoteTableEditValidation";
import { editableCellDomId } from "../quoteTableKeyboardNavigation";

export function EditableQuoteCell(props: {
  rowId: string;
  field: QuoteEditField;
  displayValue: string;
  edited?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  onCommit: (value: string | number) => void;
  onMove?: (dir: 1 | -1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    if (props.disabled) return;
    setDraft(props.displayValue === "—" ? "" : props.displayValue);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const commit = (thenMove?: 1 | -1) => {
    const result = validateQuoteFieldEdit(props.field, draft);
    if (!result.ok) {
      setError(result.messageHe);
      return;
    }
    setEditing(false);
    setError(null);
    props.onCommit(result.value);
    if (thenMove) props.onMove?.(thenMove);
  };

  if (!editing) {
    return (
      <button
        type="button"
        id={editableCellDomId(props.rowId, props.field)}
        className={cn(
          "w-full rounded-[6px] px-1.5 py-1 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          props.highlighted && "ring-1 ring-amber-500/50 bg-amber-500/10",
          props.edited && "underline decoration-dotted underline-offset-2",
          props.disabled && "cursor-default opacity-70"
        )}
        disabled={props.disabled}
        aria-label={`עריכת ${props.field}`}
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            startEdit();
          }
        }}
      >
        {props.displayValue}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${props.rowId}-${props.field}-err` : undefined}
        className="h-8 text-sm"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          } else if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Tab") {
            e.preventDefault();
            commit(e.shiftKey ? -1 : 1);
          }
        }}
      />
      {error && (
        <p
          id={`${props.rowId}-${props.field}-err`}
          className="text-[11px] text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
