"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DxfUploadArt } from "./DxfUploadArt";
import { DxfSelectedFilesBoard } from "./DxfSelectedFilesBoard";

export function DxfUploadWorkspace({
  files,
  materialRowCount,
  busy,
  isDxfFirst,
  notices,
  onPickFiles,
  onRemove,
  onClearAll,
  onContinue,
  onBack,
}: {
  files: File[];
  materialRowCount: number;
  busy: boolean;
  isDxfFirst: boolean;
  notices: string[];
  onPickFiles: (files: File[]) => void;
  onRemove: (name: string) => void;
  onClearAll: () => void;
  onContinue: () => void;
  onBack?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const empty = files.length === 0;

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
          "flex h-full min-h-0 w-full flex-col items-center px-4 text-center",
          empty ? "justify-center py-4" : "justify-stretch py-2",
          dragging && empty && "opacity-95"
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          if (empty && !busy) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busy) return;
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".dxf"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {empty ? (
          <div className="flex w-full flex-col items-center">
            <button
              type="button"
              className="group flex w-full max-w-[560px] flex-col items-center border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--ow-accent)]"
              disabled={busy}
              onClick={openPicker}
              aria-label="בחר קובצי DXF מהמחשב"
            >
              <DxfUploadArt active={dragging} />
            </button>

            <p
              className="mx-auto mt-8 max-w-[40rem] text-center text-[22px] font-medium leading-snug sm:text-[24px]"
              style={{ color: "var(--ow-text-muted, #667085)" }}
            >
              העלאת קובצי DXF, ניתן לצרף מספר קבצי ייצור בפורמט{" "}
              <span className="ow-ltr" dir="ltr">
                DXF
              </span>
            </p>

            <p
              className="mx-auto mt-3 max-w-[42rem] text-center text-[14px] leading-relaxed sm:text-[15px]"
              style={{ color: "var(--ow-text-muted, #667085)" }}
            >
              צרפו את קובצי הגאומטריה לחיבור פריטים, חישוב שטח ומשקל. להתאמה
              מדויקת מומלץ ששם הקובץ יופיע ברשימת החומר.
            </p>

            <Button
              type="button"
              className="mt-8 h-12 min-w-[11.5rem] rounded-2xl px-8 text-[15px] font-medium shadow-none transition-opacity hover:opacity-95"
              disabled={busy}
              onClick={openPicker}
              style={{
                backgroundColor: "var(--ow-accent, #0f766e)",
                color: "#ffffff",
              }}
            >
              בחר קבצים
            </Button>
          </div>
        ) : (
          <DxfSelectedFilesBoard
            files={files}
            materialRowCount={materialRowCount}
            busy={busy}
            isDxfFirst={isDxfFirst}
            onAddFiles={onPickFiles}
            onRemove={onRemove}
            onClearAll={onClearAll}
            onContinue={onContinue}
            onBack={onBack}
          />
        )}

        {notices.length > 0 && (
          <div className="mt-3 w-full max-w-[560px] shrink-0 space-y-1" role="status">
            {notices.map((n, i) => (
              <p
                key={`${n}-${i}`}
                className="text-center text-[13px]"
                style={{ color: "var(--us-error, #b42318)" }}
              >
                {n}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
