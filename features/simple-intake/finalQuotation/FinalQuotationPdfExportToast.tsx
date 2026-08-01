"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";

const PDF_LOTTIE_SRC = "/pdf_animation.json";

export const PDF_EXPORT_LOADING_MESSAGE = "מכינים עבורך את הצעת המחיר";

function PdfExportLottie() {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(PDF_LOTTIE_SRC)
      .then((r) => {
        if (!r.ok) throw new Error(`Lottie fetch failed: ${r.status}`);
        return r.json();
      })
      .then((json: unknown) => {
        if (!cancelled) setData(json as object);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div
        className="h-14 w-14 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--ow-surface-muted, #f2f4f7)" }}
        aria-hidden
      />
    );
  }

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden" aria-hidden>
      <Lottie
        animationData={data}
        loop
        autoplay
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />
    </div>
  );
}

/** Bottom toast while final-quotation PDF export is in progress. */
export function FinalQuotationPdfExportToast({ open }: { open: boolean }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-5 sm:pb-7"
      dir="rtl"
      data-pdf-export-toast="true"
    >
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="ow-cancel-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border p-3.5 shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:gap-4 sm:p-4"
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#E5E9EE",
          color: "#13202B",
        }}
      >
        <PdfExportLottie />
        <p
          className="min-w-0 flex-1 text-right text-[15px] font-semibold leading-snug"
          style={{ color: "#13202B" }}
        >
          {PDF_EXPORT_LOADING_MESSAGE}
        </p>
      </div>
    </div>,
    document.body
  );
}
