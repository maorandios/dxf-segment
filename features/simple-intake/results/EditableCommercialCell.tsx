"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Field = "material" | "thicknessMm" | "quantity";

export function EditableCommercialCell({
  field,
  value,
  onCommit,
  className,
}: {
  field: Field;
  value: string | number | null;
  onCommit: (next: string | number | null, error: string | null) => void;
  className?: string;
}) {
  const display = value == null ? "" : String(value);
  const [draft, setDraft] = useState(display);
  const [syncedValue, setSyncedValue] = useState(display);
  const [error, setError] = useState<string | null>(null);

  if (display !== syncedValue) {
    setSyncedValue(display);
    setDraft(display);
    setError(null);
  }

  function validate(raw: string): {
    ok: boolean;
    parsed: string | number | null;
    error: string | null;
  } {
    if (field === "material") {
      const t = raw.trim();
      if (t === "") {
        return { ok: false, parsed: null, error: "חסר סוג חומר" };
      }
      return { ok: true, parsed: t, error: null };
    }
    if (field === "quantity") {
      if (raw.trim() === "") {
        return { ok: false, parsed: null, error: "חסרה כמות" };
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || !(n > 0)) {
        return {
          ok: false,
          parsed: null,
          error: "כמות חייבת להיות מספר שלם חיובי",
        };
      }
      return { ok: true, parsed: n, error: null };
    }
    if (raw.trim() === "") {
      return { ok: false, parsed: null, error: "חסר עובי" };
    }
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || !(n > 0)) {
      return { ok: false, parsed: null, error: "עובי חייב להיות מספר חיובי" };
    }
    return { ok: true, parsed: n, error: null };
  }

  function commit(): void {
    const result = validate(draft);
    setError(result.error);
    if (result.ok) {
      onCommit(result.parsed, null);
    } else {
      onCommit(value, result.error);
    }
  }

  return (
    <div className={cn("min-w-[4.5rem]", className)}>
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          inputMode={field === "material" ? "text" : "decimal"}
          aria-label={
            field === "material"
              ? "חומר"
              : field === "quantity"
                ? "כמות"
                : "עובי מ״מ"
          }
          aria-invalid={error != null}
          className={cn(
            "h-8 px-2 text-sm",
            error && "border-destructive focus-visible:ring-destructive"
          )}
        />
        {field === "thicknessMm" && (
          <span className="shrink-0 text-xs text-muted-foreground">מ״מ</span>
        )}
      </div>
      {error && (
        <p className="mt-0.5 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
