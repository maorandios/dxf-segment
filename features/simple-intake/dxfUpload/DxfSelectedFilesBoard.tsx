"use client";

import { useRef } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "../ui";
import { DxfUploadArt } from "./DxfUploadArt";
import {
  DxfFilesToolbar,
  type DxfFilesToolbarAction,
} from "./DxfFilesToolbar";

export function DxfSelectedFilesBoard({
  files,
  materialRowCount,
  busy,
  isDxfFirst,
  onAddFiles,
  onRemove,
  onClearAll,
  onContinue,
  onBack,
}: {
  files: File[];
  materialRowCount: number;
  busy: boolean;
  isDxfFirst: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (name: string) => void;
  onClearAll: () => void;
  onContinue: () => void;
  onBack?: () => void;
}) {
  const addRef = useRef<HTMLInputElement>(null);
  const count = files.length;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  function handleToolbar(action: DxfFilesToolbarAction): void {
    if (action === "ADD_FILES") {
      addRef.current?.click();
      return;
    }
    if (
      !window.confirm(
        `למחוק את כל ${count.toLocaleString("he-IL")} קובצי ה-DXF שנבחרו?`
      )
    ) {
      return;
    }
    onClearAll();
  }

  const continueLabel = busy
    ? isDxfFirst
      ? "קורא קבצים..."
      : "מחבר קבצים..."
    : isDxfFirst
      ? "הבא"
      : "נתח והתאם קבצים";

  return (
    <div
      dir="rtl"
      className="relative flex h-full min-h-0 w-full max-w-[440px] flex-col items-center px-2"
    >
      {/* Soft teal ambient glow behind the board */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] -z-0 h-[70%] w-[120%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(15, 118, 110, 0.14) 0%, rgba(15, 118, 110, 0.06) 42%, transparent 72%)",
          filter: "blur(28px)",
        }}
      />

      <div className="relative z-[1] flex h-full min-h-0 w-full flex-col items-center">
        <div className="shrink-0 origin-center scale-[0.55] sm:scale-[0.6]">
          <DxfUploadArt />
        </div>

        <p
          className="-mt-6 shrink-0 text-[20px] font-medium leading-none sm:text-[22px]"
          style={{ color: "var(--ow-text, #1d2939)" }}
        >
          {count.toLocaleString("he-IL")} קובצי DXF מוכנים
        </p>

        <p
          className="mt-2 shrink-0 max-w-[36rem] text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-muted, #667085)" }}
        >
          {materialRowCount > 0
            ? `${materialRowCount.toLocaleString("he-IL")} פריטים ברשימת החומר · ${formatFileSize(totalBytes)}`
            : `${formatFileSize(totalBytes)} · ניתן להוסיף עוד קבצים לפני ההמשך`}
          <span
            className="mx-1.5"
            style={{ color: "var(--ow-success, #15803d)" }}
          >
            · מוכן להתאמה
          </span>
        </p>

        <div
          className="mt-5 flex min-h-0 w-full max-w-[360px] flex-1 flex-col overflow-hidden rounded-[22px]"
          style={{
            backgroundColor: "var(--ow-surface, #ffffff)",
            boxShadow:
              "0 1px 2px rgba(16, 24, 40, 0.04), 0 18px 44px -22px rgba(15, 118, 110, 0.22)",
            border: "1px solid rgba(15, 118, 110, 0.12)",
          }}
        >
          <div
            className="flex shrink-0 items-center justify-end px-3.5 py-3"
            style={{
              borderBottom: "1px solid var(--ow-border, #e4e7ec)",
              backgroundColor: "var(--ow-accent-soft, #e7f6f3)",
            }}
          >
            <DxfFilesToolbar
              onAction={handleToolbar}
              disabled={busy}
              embedded
            />
            <input
              ref={addRef}
              type="file"
              accept=".dxf"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = "";
                onAddFiles(list);
              }}
            />
          </div>

          <ul
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1"
            role="list"
          >
            {files.map((f, index) => (
              <li
                key={f.name}
                className="flex items-center justify-start gap-1.5 px-1 py-2.5 transition-colors hover:bg-[var(--ow-surface-muted,#f8fafc)]"
                style={{
                  borderBottom:
                    index === files.length - 1
                      ? "none"
                      : "1px solid var(--ow-border, #eef1f5)",
                }}
              >
                <p
                  className="min-w-0 truncate text-start text-[12.5px] font-medium leading-snug"
                  style={{ color: "var(--ow-text)" }}
                  title={`${f.name} · DXF · ${formatFileSize(f.size)}`}
                >
                  <span className="ow-ltr inline" dir="ltr">
                    {f.name}
                  </span>
                  <span className="mx-1 opacity-35" aria-hidden>
                    ·
                  </span>
                  <span
                    className="font-normal"
                    style={{ color: "var(--ow-text-muted)" }}
                  >
                    DXF
                  </span>
                  <span className="mx-1 opacity-35" aria-hidden>
                    ·
                  </span>
                  <span
                    className="ow-ltr inline font-normal"
                    dir="ltr"
                    style={{ color: "var(--ow-text-muted)" }}
                  >
                    {formatFileSize(f.size)}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`הסר ${f.name}`}
                  className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-[var(--ow-surface-muted,#f2f4f7)] disabled:opacity-50"
                  style={{
                    color: "var(--ow-text-muted)",
                    borderColor: "var(--ow-border, #d0d5dd)",
                  }}
                  onClick={() => onRemove(f.name)}
                >
                  <X className="h-2 w-2" strokeWidth={2.25} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-3 pb-1">
          {onBack ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-12 min-w-[7.5rem] rounded-2xl px-6 text-[15px] font-medium shadow-none"
              onClick={onBack}
            >
              חזרה
            </Button>
          ) : null}
          <Button
            type="button"
            className="inline-flex h-12 min-w-[11.5rem] items-center justify-center gap-2 rounded-2xl px-8 text-[15px] font-medium shadow-none hover:opacity-95"
            disabled={busy || count === 0}
            onClick={onContinue}
            style={{
              backgroundColor: "var(--ow-accent, #0f766e)",
              color: "#ffffff",
            }}
          >
            {continueLabel}
            <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
