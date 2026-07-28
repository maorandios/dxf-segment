"use client";

import { useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { formatFileSize } from "../ui";
import { DxfUploadArt } from "./DxfUploadArt";

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
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const count = files.length;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  function requestClearAll(): void {
    setClearOpen(true);
  }

  function confirmClearAll(): void {
    onClearAll();
    setExpanded(false);
    setClearOpen(false);
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
      className="flex h-full min-h-0 w-full max-w-[520px] flex-col items-center justify-center px-2"
    >
      <div className="flex w-full flex-col items-center">
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
          className="mt-6 w-full max-w-[440px] overflow-hidden rounded-2xl border backdrop-blur-md"
          style={{
            borderColor: "var(--ow-border, #e4e7ec)",
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 text-start transition-colors hover:bg-white/40"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((v) => !v)}
            >
              <p
                className="min-w-0 flex-1 truncate text-start text-[13px] font-medium leading-snug"
                style={{ color: "var(--ow-text)" }}
              >
                <span
                  className="font-normal"
                  style={{ color: "var(--ow-text-muted)" }}
                >
                  DXF
                </span>
                <span className="mx-1.5 opacity-40" aria-hidden>
                  ·
                </span>
                <span
                  className="ow-ltr inline font-normal"
                  dir="ltr"
                  style={{ color: "var(--ow-text-muted)" }}
                >
                  {formatFileSize(totalBytes)}
                </span>
                <span className="mx-1.5 opacity-40" aria-hidden>
                  ·
                </span>
                <span
                  className="font-normal"
                  style={{ color: "var(--ow-text-muted)" }}
                >
                  {expanded ? "הסתר רשימה" : "הצג רשימת קבצים"}
                </span>
              </p>
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform duration-200"
                style={{
                  color: "var(--ow-text-muted)",
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                }}
                strokeWidth={1.75}
                aria-hidden
              />
            </button>

            <span
              aria-hidden
              className="mx-0.5 h-6 w-px shrink-0"
              style={{ backgroundColor: "var(--ow-border, #e4e7ec)" }}
            />

            <button
              type="button"
              disabled={busy}
              aria-label="הוסף קבצים"
              title="הוסף קבצים"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/50 disabled:opacity-45"
              style={{ color: "var(--ow-text)" }}
              onClick={() => addRef.current?.click()}
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label="מחק הכל"
              title="מחק הכל"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/50 disabled:opacity-45"
              style={{ color: "var(--ow-text)" }}
              onClick={requestClearAll}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </button>

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
                if (list.length > 0) setExpanded(true);
              }}
            />
          </div>

          {expanded ? (
            <ul
              id={listId}
              className="max-h-[min(36vh,280px)] overflow-y-auto overscroll-contain px-3"
              role="list"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.55)",
                borderTop: "1px solid var(--ow-border, #eef1f5)",
              }}
            >
              {files.map((f, index) => (
                <li
                  key={f.name}
                  className="flex items-center justify-start gap-1.5 py-2.5"
                  style={{
                    borderTop:
                      index === 0
                        ? undefined
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
          ) : null}
        </div>

        <div className="mt-7 flex shrink-0 items-center justify-center">
          <div
            role="toolbar"
            aria-label="ניווט העלאת DXF"
            className="inline-flex max-w-full overflow-hidden rounded-2xl border"
            style={{
              borderColor: "var(--ow-border, #e4e7ec)",
              backgroundColor: "var(--ow-surface, #ffffff)",
            }}
          >
            {onBack ? (
              <>
                <button
                  type="button"
                  disabled={busy}
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
              </>
            ) : null}
            <button
              type="button"
              disabled={busy || count === 0}
              onClick={onContinue}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-[var(--ow-accent)] px-6 text-[15px] font-medium text-[var(--ow-accent-fg)] transition-colors hover:bg-[var(--ow-accent-hover,#115e59)] disabled:opacity-45"
            >
              {continueLabel}
              <ArrowLeft
                className="h-4 w-4 shrink-0"
                strokeWidth={2}
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>

      {clearOpen && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-5 sm:pb-7"
          dir="rtl"
        >
          <div
            role="alertdialog"
            aria-labelledby="clear-dxf-title"
            aria-describedby="clear-dxf-desc"
            className="ow-cancel-toast pointer-events-auto w-full max-w-lg rounded-2xl border p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:p-5"
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#E5E9EE",
              color: "#13202B",
              textAlign: "center",
            }}
          >
            <p
              id="clear-dxf-title"
              className="text-center text-[15px] font-semibold"
              style={{ color: "#13202B" }}
            >
              למחוק את כל קובצי ה-DXF?
            </p>
            <p
              id="clear-dxf-desc"
              className="mt-1.5 text-center text-[13px] leading-relaxed"
              style={{ color: "#5C6978" }}
            >
              יימחקו {count.toLocaleString("he-IL")} קבצים שנבחרו. ניתן להעלות
              קבצים מחדש בכל שלב.
            </p>
            <div className="mt-4 flex items-center justify-center">
              <div
                role="group"
                aria-label="אישור מחיקת קבצים"
                className="inline-flex max-w-full overflow-hidden rounded-2xl border"
                style={{
                  borderColor: "var(--ow-border, #e4e7ec)",
                  backgroundColor: "var(--ow-surface, #ffffff)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setClearOpen(false)}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-transparent px-5 text-[13px] font-medium text-[var(--ow-text)] transition-colors hover:bg-[var(--ow-surface-muted,#f2f4f7)]"
                >
                  ביטול
                </button>
                <span
                  aria-hidden
                  className="h-full w-px shrink-0 self-stretch"
                  style={{ backgroundColor: "var(--ow-border, #e4e7ec)" }}
                />
                <button
                  type="button"
                  onClick={confirmClearAll}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-[var(--ow-accent)] px-5 text-[13px] font-medium text-[var(--ow-accent-fg)] transition-colors hover:bg-[var(--ow-accent-hover,#115e59)]"
                >
                  מחק הכל
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
