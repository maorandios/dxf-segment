"use client";

import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, X } from "lucide-react";
import { detectMaterialSourceTypeFromName } from "../materialList/materialSourceTypes";
import { formatFileSize } from "../ui/deriveWorkflowPresentation";
import { MaterialSourceUploadArt } from "./MaterialSourceUploadArt";

export function SelectedWorkbookSummary({
  file,
  sheetCount,
  onRemove,
  onCreate,
  onBack,
  loading,
}: {
  file: File;
  sheetCount: number | null;
  onRemove: () => void;
  onCreate: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const sourceType = detectMaterialSourceTypeFromName(file.name) ?? "EXCEL";
  const typeLabel = sourceType === "PDF" ? "PDF" : "Excel";
  const sheetLabel =
    sourceType === "EXCEL" && sheetCount != null
      ? sheetCount === 1
        ? "גיליון אחד"
        : `${sheetCount} גיליונות`
      : null;

  return (
    <div
      dir="rtl"
      className="flex w-full max-w-[520px] flex-col items-center justify-center px-2 text-center"
    >
      <div className="shrink-0 origin-center scale-[0.72] sm:scale-[0.78]">
        <MaterialSourceUploadArt />
      </div>

      <p
        className="-mt-2 shrink-0 text-[20px] font-medium leading-none sm:text-[22px]"
        style={{ color: "var(--ow-text, #1d2939)" }}
      >
        קובץ רשימת חומר מוכן
      </p>

      <p
        className="mt-2 shrink-0 max-w-[36rem] text-[13px] leading-relaxed"
        style={{ color: "var(--ow-text-muted, #667085)" }}
      >
        {typeLabel}
        {sheetLabel ? ` · ${sheetLabel}` : null}
        {" · "}
        <span className="ow-ltr inline" dir="ltr">
          {formatFileSize(file.size)}
        </span>
        <span
          className="mx-1.5"
          style={{ color: "var(--ow-success, #15803d)" }}
        >
          · הקובץ מוכן
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
              title={file.name}
            >
              <span className="ow-ltr inline" dir="ltr">
                {file.name}
              </span>
              <span className="mx-1.5 opacity-40" aria-hidden>
                ·
              </span>
              <span
                className="font-normal"
                style={{ color: "var(--ow-text-muted)" }}
              >
                {typeLabel}
              </span>
              <span className="mx-1.5 opacity-40" aria-hidden>
                ·
              </span>
              <span
                className="ow-ltr inline font-normal"
                dir="ltr"
                style={{ color: "var(--ow-text-muted)" }}
              >
                {formatFileSize(file.size)}
              </span>
              <span className="mx-1.5 opacity-40" aria-hidden>
                ·
              </span>
              <span
                className="font-normal"
                style={{ color: "var(--ow-text-muted)" }}
              >
                {expanded ? "הסתר פרטים" : "הצג פרטי קובץ"}
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
            disabled={loading}
            aria-label="הסרת קובץ"
            title="הסרת קובץ"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/50 disabled:opacity-45"
            style={{ color: "var(--ow-text)" }}
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {expanded ? (
          <div
            id={listId}
            className="px-3 py-2.5 text-start"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.55)",
              borderTop: "1px solid var(--ow-border, #eef1f5)",
            }}
          >
            <p
              className="text-[12.5px] font-medium"
              style={{ color: "var(--ow-text)" }}
            >
              <span className="ow-ltr inline" dir="ltr">
                {file.name}
              </span>
              <span className="mx-1 opacity-35" aria-hidden>
                ·
              </span>
              <span
                className="font-normal"
                style={{ color: "var(--ow-text-muted)" }}
              >
                {typeLabel}
              </span>
              {sheetLabel ? (
                <>
                  <span className="mx-1 opacity-35" aria-hidden>
                    ·
                  </span>
                  <span
                    className="font-normal"
                    style={{ color: "var(--ow-text-muted)" }}
                  >
                    {sheetLabel}
                  </span>
                </>
              ) : null}
              <span className="mx-1 opacity-35" aria-hidden>
                ·
              </span>
              <span
                className="ow-ltr inline font-normal"
                dir="ltr"
                style={{ color: "var(--ow-text-muted)" }}
              >
                {formatFileSize(file.size)}
              </span>
            </p>
          </div>
        ) : null}
      </div>

      {/* Segmented Back + Create — same style as header Save/Cancel */}
      <div className="mt-7 flex shrink-0 items-center justify-center">
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
            <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
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
            onClick={onCreate}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-[var(--ow-accent)] px-6 text-[15px] font-medium text-[var(--ow-accent-fg)] transition-colors hover:bg-[var(--ow-accent-hover,#115e59)] disabled:opacity-45"
          >
            {loading ? "מנתח את הקובץ..." : "צור רשימת חומר"}
            {!loading ? (
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
