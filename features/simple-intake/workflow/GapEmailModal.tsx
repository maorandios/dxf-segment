"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  copyGapEmailToClipboard,
  type GapEmailDraft,
} from "../gapCommunication";

const LIGHT = {
  surface: "#ffffff",
  border: "#e4e7ec",
  text: "#101828",
  textSecondary: "#475467",
  textMuted: "#667085",
  accent: "#0f766e",
  accentFg: "#ffffff",
  success: "#15803d",
  error: "#b42318",
} as const;

function GapEmailModalForm({
  draft,
  onClose,
}: {
  draft: GapEmailDraft;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = draft.bodyHtml;
    }
  }, [draft.bodyHtml]);

  useEffect(() => {
    const stage = document.querySelector("main > .ow-stage-enter");
    const prevBodyOverflow = document.body.style.overflow;
    const prevStageOverflow =
      stage instanceof HTMLElement ? stage.style.overflow : "";
    document.body.style.overflow = "hidden";
    if (stage instanceof HTMLElement) stage.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      if (stage instanceof HTMLElement) stage.style.overflow = prevStageOverflow;
    };
  }, []);

  async function handleCopy(): Promise<void> {
    setCopyState("idle");
    setErrorMessage(null);
    const liveHtml = bodyRef.current?.innerHTML ?? draft.bodyHtml;
    const liveText = (bodyRef.current?.innerText ?? draft.body)
      .replace(/\r\n/g, "\n")
      .trimEnd();
    const result = await copyGapEmailToClipboard({
      subject,
      body: liveText,
      bodyHtml: liveHtml,
    });
    if (result.ok) {
      setCopyState("ok");
      return;
    }
    setCopyState("error");
    setErrorMessage(result.message);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      dir="rtl"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 backdrop-blur-[6px]"
        style={{ backgroundColor: "rgba(16, 24, 40, 0.35)" }}
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="מייל פערים"
        className="omega-workflow relative z-[1] flex max-h-[min(90vh,40rem)] w-[min(94vw,40rem)] flex-col overflow-hidden rounded-[14px] border shadow-xl"
        style={{
          borderColor: LIGHT.border,
          backgroundColor: LIGHT.surface,
          color: LIGHT.text,
          colorScheme: "light",
        }}
      >
        <header
          className="shrink-0 border-b px-5 py-4"
          style={{
            borderColor: LIGHT.border,
            backgroundColor: LIGHT.surface,
          }}
        >
          <h2
            className="text-[16px] font-semibold"
            style={{ color: LIGHT.text }}
          >
            מייל פערים ללקוח
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: LIGHT.textMuted }}>
            ניתן לערוך את הנושא והגוף לפני ההעתקה. OMEGA לא שולחת את המייל.
          </p>
        </header>

        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
          style={{ backgroundColor: LIGHT.surface }}
        >
          <label className="block space-y-1.5">
            <span
              className="text-[12px] font-medium"
              style={{ color: LIGHT.textSecondary }}
            >
              נושא
            </span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 rounded-xl text-[13px] shadow-none"
              style={{
                backgroundColor: LIGHT.surface,
                color: LIGHT.text,
                borderColor: LIGHT.border,
              }}
            />
          </label>
          <div className="block space-y-1.5">
            <span
              className="text-[12px] font-medium"
              style={{ color: LIGHT.textSecondary }}
            >
              גוף המייל
            </span>
            <div
              ref={bodyRef}
              role="textbox"
              aria-multiline="true"
              contentEditable
              suppressContentEditableWarning
              dir="rtl"
              className="gap-email-body min-h-[16rem] rounded-xl border px-3 py-2.5 text-[13px] leading-relaxed outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: LIGHT.border,
                backgroundColor: LIGHT.surface,
                color: LIGHT.text,
                outlineColor: LIGHT.accent,
              }}
            />
            <style>{`
              .gap-email-body,
              .gap-email-body * {
                background: transparent !important;
                background-color: transparent !important;
                color: ${LIGHT.text} !important;
              }
              .gap-email-body strong {
                font-weight: 700;
              }
            `}</style>
          </div>
          {copyState === "ok" ? (
            <p
              className="text-[13px] font-medium"
              style={{ color: LIGHT.success }}
            >
              המייל הועתק
            </p>
          ) : null}
          {copyState === "error" && errorMessage ? (
            <p className="text-[13px]" style={{ color: LIGHT.error }}>
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer
          className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-5 py-3"
          style={{
            borderColor: LIGHT.border,
            backgroundColor: LIGHT.surface,
          }}
        >
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl px-4 shadow-none"
            style={{
              backgroundColor: LIGHT.surface,
              color: LIGHT.text,
              borderColor: LIGHT.border,
            }}
            onClick={onClose}
          >
            סגור
          </Button>
          <Button
            type="button"
            className="h-10 rounded-2xl px-5 font-medium shadow-none"
            style={{
              backgroundColor: LIGHT.accent,
              color: LIGHT.accentFg,
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
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <GapEmailModalForm
      key={`${draft.subject}::${draft.body.slice(0, 64)}`}
      draft={draft}
      onClose={onClose}
    />,
    document.body
  );
}
