"use client";

import { Button } from "@/components/ui/button";
import { detectMaterialSourceTypeFromName } from "../materialList/materialSourceTypes";
import { formatFileSize } from "../ui/deriveWorkflowPresentation";
import { MaterialSourceFileIcon } from "./MaterialSourceUploadArt";

export function SelectedWorkbookSummary({
  file,
  sheetCount,
  onRemove,
  onCreate,
  loading,
}: {
  file: File;
  sheetCount: number | null;
  onRemove: () => void;
  onCreate: () => void;
  loading: boolean;
}) {
  const sourceType = detectMaterialSourceTypeFromName(file.name) ?? "EXCEL";

  return (
    <div className="us-state-swap flex flex-col items-center px-2 text-center">
      <div className="mb-5">
        <MaterialSourceFileIcon sourceType={sourceType} size={96} />
      </div>

      <p
        className="us-ltr max-w-full truncate text-[15px] font-medium"
        style={{ color: "var(--ow-text, var(--us-text))" }}
        title={file.name}
        dir="ltr"
      >
        {file.name}
      </p>
      <p
        className="mt-1 text-[12px]"
        style={{ color: "var(--ow-text-muted, var(--us-text-muted))" }}
      >
        {sourceType === "PDF" ? "PDF" : null}
        {sourceType === "EXCEL" && sheetCount != null
          ? `${sheetCount === 1 ? "גיליון אחד" : `${sheetCount} גיליונות`}`
          : sourceType === "EXCEL"
            ? "Excel"
            : null}
        {" · "}
        <span className="us-ltr inline-block" dir="ltr">
          {formatFileSize(file.size)}
        </span>
        <span className="mx-1.5" style={{ color: "var(--ow-success, #15803d)" }}>
          · הקובץ מוכן
        </span>
      </p>

      <button
        type="button"
        className="mt-4 text-[13px] font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--ow-text-muted, #667085)" }}
        onClick={onRemove}
      >
        הסרת קובץ
      </button>

      <Button
        type="button"
        className="mt-6 h-12 min-w-[11.5rem] rounded-2xl px-8 text-[15px] font-medium shadow-none hover:opacity-95"
        disabled={loading}
        onClick={onCreate}
        style={{
          backgroundColor: "var(--ow-accent, #0f766e)",
          color: "#fff",
        }}
      >
        {loading ? "מנתח את הקובץ..." : "צור רשימת חומר"}
      </Button>
    </div>
  );
}
