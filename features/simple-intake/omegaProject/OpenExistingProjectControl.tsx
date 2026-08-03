"use client";

/**
 * Open an existing .segment portable quotation from the project-start screen.
 */

import { useCallback, useRef, useState, type DragEvent } from "react";
import { FolderOpen, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasUnsavedProjectChanges } from "../omegaProject/dirtyState";
import {
  getSimpleIntakeSession,
  simpleIntakeActions,
} from "../sessionStore";
import {
  OMEGA_PROJECT_FILE_EXTENSION,
  OMEGA_PROJECT_LEGACY_FILE_EXTENSION,
  OMEGA_PROJECT_MIME_TYPE,
  OMEGA_PROJECT_LEGACY_MIME_TYPE,
} from "./types";

const ACCEPT = [
  OMEGA_PROJECT_FILE_EXTENSION,
  OMEGA_PROJECT_LEGACY_FILE_EXTENSION,
  OMEGA_PROJECT_MIME_TYPE,
  OMEGA_PROJECT_LEGACY_MIME_TYPE,
].join(",");

function isAcceptedProjectFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(OMEGA_PROJECT_FILE_EXTENSION) ||
    lower.endsWith(OMEGA_PROJECT_LEGACY_FILE_EXTENSION) ||
    lower.endsWith(".zip")
  );
}

export function OpenExistingProjectControl({
  className,
  variant = "button",
}: {
  className?: string;
  /** `panel` — full drop-zone used on the setup split layout. */
  variant?: "button" | "panel";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function openFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const name = file.name.toLowerCase();
      if (!isAcceptedProjectFileName(name)) {
        setError(
          `קובץ לא נתמך. יש לבחור קובץ הצעה מסוג ${OMEGA_PROJECT_FILE_EXTENSION} בלבד.`
        );
        return;
      }
      const result = await simpleIntakeActions.openOmegaProjectFile(file);
      if (!result.ok) {
        setError(result.error || "לא ניתן היה לפתוח את ההצעה.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "לא ניתן היה לפתוח את ההצעה."
      );
    } finally {
      setBusy(false);
      setPendingFile(null);
      setConfirmOpen(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPick(file: File | null | undefined): void {
    if (!file) return;
    const session = getSimpleIntakeSession();
    const hasProject =
      Boolean(session.quoteDetails) ||
      session.dxfFiles.length > 0 ||
      Boolean(session.workbookFile) ||
      session.materialListRows.length > 0;
    if (hasProject && hasUnsavedProjectChanges()) {
      setPendingFile(file);
      setConfirmOpen(true);
      return;
    }
    void openFile(file);
  }

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    onPick(file);
  }, []);

  const confirmDialog =
    confirmOpen && pendingFile ? (
      <div className="fixed inset-0 z-[60]" dir="rtl">
        <button
          type="button"
          className="ow-toast-scrim absolute inset-0"
          aria-label="סגור"
          onClick={() => {
            setConfirmOpen(false);
            setPendingFile(null);
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-5 sm:pb-7">
          <div
            role="alertdialog"
            aria-labelledby="replace-project-title"
            className="pointer-events-auto w-full max-w-lg rounded-2xl border bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:p-5"
            style={{ borderColor: "#E5E9EE", textAlign: "center" }}
          >
            <p
              id="replace-project-title"
              className="text-[15px] font-semibold"
              style={{ color: "#13202B" }}
            >
              פתיחת הצעה אחרת תחליף את ההצעה הנוכחית.
            </p>
            <p
              className="mt-1.5 text-[13px] leading-relaxed"
              style={{ color: "#5C6978" }}
            >
              השינויים שלא נשמרו יאבדו.
            </p>
            <div className="mt-4 flex items-center justify-center gap-0">
              <div
                className="inline-flex overflow-hidden rounded-2xl border"
                style={{ borderColor: "#e4e7ec" }}
              >
                <button
                  type="button"
                  className="inline-flex h-10 items-center px-5 text-[13px] font-medium"
                  onClick={() => {
                    setConfirmOpen(false);
                    setPendingFile(null);
                  }}
                >
                  ביטול
                </button>
                <span
                  aria-hidden
                  className="w-px self-stretch"
                  style={{ backgroundColor: "#e4e7ec" }}
                />
                <button
                  type="button"
                  className="inline-flex h-10 items-center bg-[var(--ow-accent,#0F766E)] px-5 text-[13px] font-medium text-white"
                  onClick={() => void openFile(pendingFile)}
                >
                  פתח הצעה אחרת
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  if (variant === "panel") {
    return (
      <div className={cn("flex h-full min-h-0 w-full flex-col", className)} dir="rtl">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-hidden
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <div
          role="button"
          tabIndex={0}
          data-open-existing-project="true"
          aria-label="פתח הצעה קיימת"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!busy) inputRef.current?.click();
            }
          }}
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={onDrop}
          className={cn(
            "group relative flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[20px] border border-dashed px-5 py-5 text-center transition-all duration-300",
            dragging
              ? "border-[#0F766E] bg-[#E8F6F3] scale-[1.01]"
              : "border-[#E4E7EC] bg-white/70 hover:border-[#0F766E]/55 hover:bg-[#F5FBF9]"
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.4]"
            aria-hidden
          >
            <svg
              className="h-full w-full"
              viewBox="0 0 420 360"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <linearGradient id="omega-open-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0F766E" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#0F766E" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle cx="340" cy="48" r="90" fill="url(#omega-open-g)" />
              <circle cx="60" cy="300" r="70" fill="url(#omega-open-g)" />
            </svg>
          </div>

          <div
            className={cn(
              "relative mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300",
              dragging ? "scale-110" : "group-hover:scale-105"
            )}
            style={{
              backgroundColor: "#E8F6F3",
              color: "#0F766E",
              boxShadow: "0 8px 20px rgba(15,118,110,0.1)",
            }}
          >
            <FileUp className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>

          <p className="relative text-[16px] font-semibold tracking-tight text-[#13202B] sm:text-[17px]">
            {busy ? "פותח הצעה..." : "פתח הצעה קיימת"}
          </p>
          <p className="relative mt-1.5 max-w-[16rem] text-[12px] leading-relaxed text-[#5C6978]">
            גררו קובץ{" "}
            <span className="font-medium text-[#0F766E]" dir="ltr">
              {OMEGA_PROJECT_FILE_EXTENSION}
            </span>{" "}
            לכאן או לחצו לבחירה.
          </p>

          <span
            className="relative mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium text-white transition-colors"
            style={{ backgroundColor: "#0F766E" }}
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden />
            בחירת קובץ הצעה
          </span>
        </div>

        {error ? (
          <p
            className="mt-3 text-center text-[13px]"
            style={{ color: "#B42318" }}
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className={className} dir="rtl">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-hidden
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        className="h-12 rounded-2xl border-[#E5E9EE] text-[14px] shadow-none"
        onClick={() => inputRef.current?.click()}
        data-open-existing-project="true"
      >
        <FolderOpen className="ms-2 h-4 w-4" aria-hidden />
        {busy ? "פותח..." : "פתח הצעה קיימת"}
      </Button>
      {error ? (
        <p
          className="mt-2 text-center text-[13px]"
          style={{ color: "#B42318" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {confirmDialog}
    </div>
  );
}
