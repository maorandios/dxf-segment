"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "../ui/deriveWorkflowPresentation";

export function SelectedWorkbookSummary({
  file,
  sheetCount,
  onReplace,
  onRemove,
  onCreate,
  loading,
}: {
  file: File;
  sheetCount: number | null;
  onReplace: () => void;
  onRemove: () => void;
  onCreate: () => void;
  loading: boolean;
}) {
  return (
    <div className="us-state-swap flex flex-col items-center px-2 text-center">
      <div
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--us-success-soft)" }}
      >
        <FileSpreadsheet
          className="h-5 w-5"
          style={{ color: "var(--us-success)" }}
          aria-hidden
        />
      </div>

      <p
        className="us-ltr max-w-full truncate text-[15px] font-medium"
        style={{ color: "var(--us-text)" }}
        title={file.name}
        dir="ltr"
      >
        {file.name}
      </p>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--us-text-muted)" }}>
        <span className="us-ltr inline-block" dir="ltr">
          {formatFileSize(file.size)}
        </span>
        {sheetCount != null
          ? ` · ${sheetCount === 1 ? "גיליון אחד" : `${sheetCount} גיליונות`}`
          : null}
        <span className="mx-1.5" style={{ color: "var(--us-success)" }}>
          · הקובץ מוכן
        </span>
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onReplace}>
          החלף קובץ
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          הסר
        </Button>
      </div>

      <Button
        type="button"
        className="mt-4 min-w-[11rem]"
        disabled={loading}
        onClick={onCreate}
        style={{
          backgroundColor: "var(--us-accent)",
          color: "#fff",
        }}
      >
        {loading ? "מנתח את הקובץ..." : "צור רשימת חומר"}
      </Button>
    </div>
  );
}
