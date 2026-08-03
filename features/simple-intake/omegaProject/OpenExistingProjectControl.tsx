"use client";

/**
 * Open an existing .omega portable quotation from the project-start screen.
 */

import { useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasUnsavedProjectChanges } from "../omegaProject/dirtyState";
import { simpleIntakeActions } from "../sessionStore";
import { getSimpleIntakeSession } from "../sessionStore";

const ACCEPT = ".omega,application/vnd.omega.quotation+zip";

export function OpenExistingProjectControl({
  className,
}: {
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const name = file.name.toLowerCase();
      if (
        !name.endsWith(".omega") &&
        !name.endsWith(".zip")
      ) {
        setError(
          "קובץ לא נתמך. יש לבחור קובץ הצעה מסוג .omega בלבד."
        );
        return;
      }
      const result = await simpleIntakeActions.openOmegaProjectFile(file);
      if (!result.ok) {
        setError(result.error || "לא ניתן היה לפתוח את ההצעה.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן היה לפתוח את ההצעה.");
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

  return (
    <div className={className} dir="rtl">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          onPick(file);
        }}
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
        <p className="mt-2 text-center text-[13px]" style={{ color: "#B42318" }} role="alert">
          {error}
        </p>
      ) : null}

      {confirmOpen && pendingFile ? (
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
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "#5C6978" }}>
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
      ) : null}
    </div>
  );
}
