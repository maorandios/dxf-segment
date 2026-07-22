"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SelectedWorkbookSummary } from "./SelectedWorkbookSummary";

const ACCEPT =
  ".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function WorkbookUploadWorkspace({
  file,
  sheetCount,
  loading,
  notice,
  onPickFiles,
  onReplaceClick,
  onRemove,
  onCreate,
}: {
  file: File | null;
  sheetCount: number | null;
  loading: boolean;
  notice: string | null;
  onPickFiles: (files: File[]) => void;
  onReplaceClick: () => void;
  onRemove: () => void;
  onCreate: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onPickFiles(Array.from(list));
    },
    [onPickFiles]
  );

  return (
    <div
      className="us-enter-delay-2 mx-auto flex w-full flex-col items-center"
      style={{ width: "min(900px, 100%)" }}
    >
      <div
        className={cn(
          "us-workspace-card flex w-full flex-col items-center justify-center px-8 py-10 text-center sm:px-12 sm:py-12",
          dragging && "border-[color:var(--us-accent)]"
        )}
        style={{ minHeight: 420 }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!file && !loading) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (file || loading) return;
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {!file ? (
          <div className="us-state-swap flex flex-col items-center">
            <button
              type="button"
              className="us-upload-zone group flex w-full flex-col items-center rounded-[20px] border border-dashed px-6 py-7 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                width: "min(460px, 100%)",
                minHeight: 170,
                borderColor: dragging
                  ? "var(--us-accent)"
                  : "var(--us-border-strong)",
                backgroundColor: dragging
                  ? "var(--us-accent-soft)"
                  : "var(--us-surface-soft)",
              }}
              disabled={loading}
              onClick={openPicker}
              aria-label="בחר קובץ Excel או PDF מהמחשב"
            >
              <span
                className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--us-accent-soft)" }}
              >
                <Upload
                  className="h-5 w-5"
                  style={{ color: "var(--us-accent)" }}
                  aria-hidden
                />
              </span>
              <span
                className="text-[15px] font-medium"
                style={{ color: "var(--us-text)" }}
              >
                גרור לכאן קובץ Excel או PDF
              </span>
              <span
                className="mt-1 text-[13px]"
                style={{ color: "var(--us-text-muted)" }}
              >
                או בחר קובץ מהמחשב
              </span>
              <span
                className="us-ltr mt-3 text-[12px]"
                style={{ color: "var(--us-text-muted)" }}
                dir="ltr"
              >
                XLSX, XLS, PDF
              </span>
            </button>

            <Button
              type="button"
              className="mt-5 h-11 min-w-[12rem] rounded-2xl text-[14px] font-medium shadow-none hover:opacity-95"
              disabled={loading}
              onClick={openPicker}
              style={{
                backgroundColor: "var(--ow-accent, var(--us-accent, #0f766e))",
                color: "#ffffff",
              }}
            >
              בחר קובץ
            </Button>
          </div>
        ) : (
          <SelectedWorkbookSummary
            file={file}
            sheetCount={sheetCount}
            onReplace={onReplaceClick}
            onRemove={onRemove}
            onCreate={onCreate}
            loading={loading}
          />
        )}

        {notice && (
          <p
            className="mt-4 text-center text-[13px]"
            style={{ color: "var(--us-error)" }}
            role="status"
          >
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
