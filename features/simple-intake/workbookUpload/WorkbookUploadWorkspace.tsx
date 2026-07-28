"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
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
  onBack,
}: {
  file: File | null;
  sheetCount: number | null;
  loading: boolean;
  notice: string | null;
  onPickFiles: (files: File[]) => void;
  onRemove: () => void;
  onCreate: () => void;
  onBack: () => void;
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
      className="mx-auto flex h-full min-h-0 w-full flex-col items-center"
      style={{ width: "min(1100px, 100%)" }}
    >
      <div
        className={cn(
          "flex h-full min-h-0 w-full flex-col items-center justify-center px-6 text-center",
          dragging && !file && "opacity-95"
        )}
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

            <div className="mt-8 flex shrink-0 items-center justify-center">
              <div
                role="toolbar"
                aria-label="ניווט רשימת חומר"
                className="inline-flex max-w-full overflow-hidden rounded-2xl border"
                style={{
                  borderColor: "var(--ow-border, #e4e7ec)",
                  backgroundColor: "var(--ow-surface, #ffffff)",
                }}
              >
                <button
                  type="button"
                  disabled={loading}
                  onClick={onBack}
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-transparent px-5 text-[15px] font-medium text-[var(--ow-text)] transition-colors hover:bg-[var(--ow-surface-muted,#f2f4f7)] disabled:opacity-45"
                >
                  <ArrowRight
                    className="h-4 w-4 shrink-0"
                    strokeWidth={2}
                    aria-hidden
                  />
                  חזרה
                </button>
                <span
                  aria-hidden
                  className="h-full w-px shrink-0 self-stretch"
                  style={{ backgroundColor: "var(--ow-border, #e4e7ec)" }}
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={openPicker}
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-[var(--ow-accent)] px-6 text-[15px] font-medium text-[var(--ow-accent-fg)] transition-colors hover:bg-[var(--ow-accent-hover,#115e59)] disabled:opacity-45"
                >
                  בחר קובץ
                </button>
              </div>
            </div>
          </div>
        ) : (
          <SelectedWorkbookSummary
            file={file}
            sheetCount={sheetCount}
            onRemove={onRemove}
            onCreate={onCreate}
            onBack={onBack}
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
