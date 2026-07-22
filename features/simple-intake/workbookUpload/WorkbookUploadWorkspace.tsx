"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MaterialSourceUploadArt } from "./MaterialSourceUploadArt";
import { SelectedWorkbookSummary } from "./SelectedWorkbookSummary";

const ACCEPT =
  ".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function WorkbookUploadWorkspace({
  file,
  sheetCount,
  loading,
  notice,
  onPickFiles,
  onRemove,
  onCreate,
}: {
  file: File | null;
  sheetCount: number | null;
  loading: boolean;
  notice: string | null;
  onPickFiles: (files: File[]) => void;
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
      style={{ width: "min(1100px, 100%)" }}
    >
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center px-6 py-6 text-center",
          dragging && "opacity-95"
        )}
        style={{ minHeight: 520 }}
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
          <div className="us-state-swap flex w-full flex-col items-center">
            <button
              type="button"
              className="group flex w-full max-w-[560px] flex-col items-center border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--ow-accent)]"
              disabled={loading}
              onClick={openPicker}
              aria-label="בחר קובץ Excel או PDF מהמחשב"
            >
              <MaterialSourceUploadArt active={dragging} />
            </button>

            <p
              className="mx-auto mt-10 whitespace-nowrap text-center text-[22px] font-medium leading-none sm:text-[24px]"
              style={{ color: "var(--ow-text-muted, #667085)" }}
            >
              העלאת קובץ רשימת חומר, ניתן לצרף קבצים בפורמט{" "}
              <span className="us-ltr" dir="ltr">
                EXCEL
              </span>{" "}
              ו{" "}
              <span className="us-ltr" dir="ltr">
                PDF
              </span>
            </p>

            <p
              className="mx-auto mt-3 max-w-[42rem] text-center text-[14px] leading-relaxed sm:text-[15px]"
              style={{ color: "var(--ow-text-muted, #667085)" }}
            >
              צרפו את רשימת החומר לתמחור שקיבלתם מהלקוח, ניתן לצרף קובץ אחד
              בפורמט{" "}
              <span className="us-ltr" dir="ltr">
                PDF
              </span>{" "}
              או{" "}
              <span className="us-ltr" dir="ltr">
                EXCEL
              </span>
              .
            </p>

            <Button
              type="button"
              className="mt-8 h-12 min-w-[11.5rem] rounded-2xl px-8 text-[15px] font-medium shadow-none transition-opacity hover:opacity-95"
              disabled={loading}
              onClick={openPicker}
              style={{
                backgroundColor: "var(--ow-accent, #0f766e)",
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
            onRemove={onRemove}
            onCreate={onCreate}
            loading={loading}
          />
        )}

        {notice && (
          <p
            className="mt-5 text-center text-[13px]"
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
