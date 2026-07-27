"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  copyGapEmailToClipboard,
  type GapEmailDraft,
} from "../gapCommunication";

function GapEmailModalForm({
  draft,
  onClose,
}: {
  draft: GapEmailDraft;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCopy(): Promise<void> {
    setCopyState("idle");
    setErrorMessage(null);
    const result = await copyGapEmailToClipboard({ subject, body });
    if (result.ok) {
      setCopyState("ok");
      return;
    }
    setCopyState("error");
    setErrorMessage(result.message);
  }

  return (
    <div className="fixed inset-0 z-50" dir="rtl" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="מייל פערים"
        className="absolute left-1/2 top-1/2 flex max-h-[min(90vh,40rem)] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--ow-radius-lg)] border bg-background shadow-xl"
        style={{ borderColor: "var(--ow-border)" }}
      >
        <header className="shrink-0 border-b px-5 py-4">
          <h2
            className="text-[16px] font-semibold"
            style={{ color: "var(--ow-text)" }}
          >
            מייל פערים ללקוח
          </h2>
          <p
            className="mt-1 text-[12px]"
            style={{ color: "var(--ow-text-muted)" }}
          >
            ניתן לערוך את הנושא והגוף לפני ההעתקה. OMEGA לא שולחת את המייל.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <label className="block space-y-1.5">
            <span
              className="text-[12px] font-medium"
              style={{ color: "var(--ow-text-secondary)" }}
            >
              נושא
            </span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 rounded-xl bg-white text-[13px]"
            />
          </label>
          <label className="block space-y-1.5">
            <span
              className="text-[12px] font-medium"
              style={{ color: "var(--ow-text-secondary)" }}
            >
              גוף המייל
            </span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="min-h-[16rem] rounded-xl bg-white text-[13px] leading-relaxed"
            />
          </label>
          {copyState === "ok" ? (
            <p
              className="text-[13px] font-medium"
              style={{ color: "var(--ow-success, #15803d)" }}
            >
              המייל הועתק
            </p>
          ) : null}
          {copyState === "error" && errorMessage ? (
            <p
              className="text-[13px]"
              style={{ color: "var(--ow-error, #b42318)" }}
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-5 py-3">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl px-4"
            onClick={onClose}
          >
            סגור
          </Button>
          <Button
            type="button"
            className="h-10 rounded-2xl px-5 font-medium shadow-none"
            style={{
              backgroundColor: "var(--ow-accent)",
              color: "var(--ow-accent-fg)",
            }}
            onClick={() => void handleCopy()}
          >
            העתק מייל
          </Button>
        </footer>
      </div>
    </div>
  );
}

export function GapEmailModal({
  open,
  draft,
  onClose,
}: {
  open: boolean;
  draft: GapEmailDraft;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <GapEmailModalForm
      key={`${draft.subject}::${draft.body.slice(0, 64)}`}
      draft={draft}
      onClose={onClose}
    />
  );
}
