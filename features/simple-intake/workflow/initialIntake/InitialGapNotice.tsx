"use client";

import { Info } from "lucide-react";
import type { InitialIntakeSummary } from "../../buildInitialIntakeSummary";

export function DuplicateUploadInfo({
  summary,
}: {
  summary: InitialIntakeSummary;
}) {
  const n = summary.uploads.exactDuplicateFileCount;
  if (n <= 0) return null;

  return (
    <div
      className="flex items-start gap-2.5 rounded-[16px] border px-4 py-3"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-info-soft)",
      }}
      role="status"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: "var(--ow-text-secondary)" }}
        aria-hidden
      />
      <div className="min-w-0 text-[13px] leading-relaxed">
        <p className="font-medium" style={{ color: "var(--ow-text)" }}>
          {n === 1
            ? "זוהה עותק כפול בתוכן הקובץ"
            : `זוהו ${n.toLocaleString("he-IL")} עותקים כפולים בתוכן`}
        </p>
        <p style={{ color: "var(--ow-text-secondary)" }}>
          {summary.uploads.physicalFileCount.toLocaleString("he-IL")} קבצים
          הועלו · {summary.uploads.uniqueContentFileCount.toLocaleString("he-IL")}{" "}
          תכנים ייחודיים נספרים בניתוח
        </p>
      </div>
    </div>
  );
}

export function InitialGapNotice({
  heading,
  body,
  severity,
  actionLabel,
  onAction,
}: {
  heading: string;
  body?: string;
  severity: "serious" | "information";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const isSerious = severity === "serious";
  return (
    <aside
      className="rounded-[18px] border px-4 py-3.5"
      style={{
        backgroundColor: isSerious
          ? "rgba(254, 243, 199, 0.55)"
          : "var(--ow-info-soft)",
        borderColor: isSerious ? "#F9DBAF" : "var(--ow-border)",
      }}
      role={isSerious ? "status" : "status"}
    >
      <h3
        className="text-[15px] font-medium leading-snug"
        style={{
          color: isSerious ? "#B45309" : "var(--ow-text)",
        }}
      >
        {heading}
      </h3>
      {body ? (
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {body}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="mt-2.5 text-[13px] font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--ow-accent)" }}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </aside>
  );
}
