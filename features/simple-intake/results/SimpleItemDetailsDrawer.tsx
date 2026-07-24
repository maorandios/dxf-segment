"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  formatAreaM2,
  formatDxfDims,
  formatWeightKg,
} from "./commercialCalculations";
import { describeDimensionComparisonHe } from "./dimensionComparisonCopy";
import {
  activeReviewReasonLabelHe,
  getActiveBlockingReasons,
  getActiveReviewReasons,
} from "./activeReviewReasons";
import { issueMessageHe, REVIEW_STATUS_HE } from "./issueMessages";
import { SimpleDxfThumbnail } from "./SimpleDxfThumbnail";
import type { PlateDimensionComparison } from "../dxfLink/dimensionMismatch";
import type { FinalIntakeRow } from "./types";

function DimensionComparisonNote({
  comparison,
}: {
  comparison: PlateDimensionComparison;
}) {
  const copy = describeDimensionComparisonHe(comparison);
  return (
    <div
      className="mt-3 space-y-1 rounded-md border px-3 py-2 text-xs"
      style={{
        borderColor: "var(--ow-border, hsl(var(--border)))",
        backgroundColor: copy.isActionRequired
          ? "var(--ow-attention-soft, hsl(var(--muted)))"
          : "var(--ow-surface-muted, hsl(var(--muted)))",
      }}
    >
      <p>
        מידות ברשימת החומר: {copy.sourceLabel}
      </p>
      <p>מידות DXF: {copy.dxfLabel}</p>
      {copy.orientationNote ? <p>{copy.orientationNote}</p> : null}
      <p
        style={{
          color: copy.isActionRequired
            ? "var(--ow-attention, hsl(var(--foreground)))"
            : "var(--ow-text-secondary, hsl(var(--muted-foreground)))",
        }}
      >
        {copy.toleranceNote}
      </p>
      {!copy.isActionRequired ? (
        <p className="text-muted-foreground">אין צורך בפעולה.</p>
      ) : null}
    </div>
  );
}

export function SimpleItemDetailsDrawer({
  row,
  open,
  onClose,
  onPickDxf,
  onConfirmManual,
  onExclude,
  onRestore,
  noDxfFilesUploaded,
}: {
  row: FinalIntakeRow | null;
  open: boolean;
  onClose: () => void;
  onPickDxf: () => void;
  onConfirmManual: () => void;
  onExclude: () => void;
  onRestore: () => void;
  noDxfFilesUploaded: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !row) return null;

  return (
    <div className="fixed inset-0 z-50" dir="rtl" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="סגור פרטים"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="פרטי פריט"
        className="absolute inset-y-0 end-0 flex w-full max-w-lg flex-col border-s border-border bg-background shadow-xl outline-none sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{row.part.displayName}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            סגור
          </Button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-4 text-sm">
          <section>
            <h3 className="mb-2 font-medium">פרטי הפריט</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">סטטוס</dt>
              <dd>{REVIEW_STATUS_HE[row.status]}</dd>
              <dt className="text-muted-foreground">חומר</dt>
              <dd>{row.material ?? "—"}</dd>
              <dt className="text-muted-foreground">עובי</dt>
              <dd>
                {row.thicknessMm != null ? `${row.thicknessMm} מ״מ` : "—"}
              </dd>
              <dt className="text-muted-foreground">כמות</dt>
              <dd>{row.quantity ?? "—"}</dd>
              <dt className="text-muted-foreground">מידות DXF</dt>
              <dd>
                {formatDxfDims(
                  row.dxfDimensions.widthMm,
                  row.dxfDimensions.lengthMm
                )}
              </dd>
              <dt className="text-muted-foreground">שטח מסחרי</dt>
              <dd>{formatAreaM2(row.commercial.areaM2)}</dd>
              <dt className="text-muted-foreground">משקל ליחידה</dt>
              <dd>{formatWeightKg(row.commercial.unitWeightKg)}</dd>
              <dt className="text-muted-foreground">משקל כולל</dt>
              <dd>{formatWeightKg(row.commercial.totalWeightKg)}</dd>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 font-medium">תצוגת DXF</h3>
            <SimpleDxfThumbnail
              widthMm={row.dxfDimensions.widthMm}
              lengthMm={row.dxfDimensions.lengthMm}
              size="lg"
              label="תצוגת DXF מוגדלת"
            />
            {row.part.matchedDxfFilename && (
              <p className="mt-2 text-muted-foreground">
                {row.part.matchedDxfFilename}
              </p>
            )}
            {row.preview.geometryAvailable &&
              row.quantity != null &&
              row.quantity > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  קובץ ה-DXF המשויך משמש כגאומטריה לחישוב היחידות בשורת החומר.
                </p>
              )}
          </section>

          <section>
            <h3 className="mb-2 font-medium">השוואת מקורות</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1 text-right font-medium">שדה</th>
                  <th className="py-1 text-right font-medium">מסמך</th>
                  <th className="py-1 text-right font-medium">DXF / חישוב</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60">
                  <td className="py-1.5">רוחב</td>
                  <td>{fmt(row.source.sourceWidthMm)}</td>
                  <td>
                    {fmt(
                      row.rawDxfDimensions?.widthMm ?? row.dxfDimensions.widthMm
                    )}
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-1.5">אורך</td>
                  <td>{fmt(row.source.sourceLengthMm)}</td>
                  <td>
                    {fmt(
                      row.rawDxfDimensions?.lengthMm ??
                        row.dxfDimensions.lengthMm
                    )}
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-1.5">שטח מקור</td>
                  <td>{fmt(row.source.sourceAreaM2)}</td>
                  <td>—</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-1.5">משקל מקור</td>
                  <td>{fmt(row.source.sourceWeightKg)}</td>
                  <td>—</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-1.5">שטח מסחרי</td>
                  <td>—</td>
                  <td>{formatAreaM2(row.commercial.areaM2)}</td>
                </tr>
                <tr>
                  <td className="py-1.5">משקל מסחרי</td>
                  <td>—</td>
                  <td>{formatWeightKg(row.commercial.unitWeightKg)}</td>
                </tr>
              </tbody>
            </table>
            {row.dimensionComparison ? (
              <DimensionComparisonNote comparison={row.dimensionComparison} />
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                ערכי השטח והמשקל מהמסמך נשמרים כערכי מקור. החישוב המסחרי מבוסס על
                מידות קובץ ה-DXF.
              </p>
            )}
          </section>

          {(row.status === "NEEDS_REVIEW" || row.status === "BLOCKED") && (
            <section>
              <h3 className="mb-2 font-medium">סיבת הבדיקה</h3>
              {(() => {
                const exact =
                  row.match.status === "MATCHED" &&
                  (row.match.method === "EXPLICIT_FILENAME" ||
                    row.match.method === "EXACT_ID");
                const reasons = [
                  ...getActiveReviewReasons(row.issueCodes, {
                    issueCodes: row.issueCodes,
                    dimensionComparison: row.dimensionComparison,
                    exactIdentifierAssignment: exact,
                  }),
                  ...getActiveBlockingReasons(row.issueCodes),
                ];
                if (reasons.length === 0) {
                  return (
                    <p className="text-muted-foreground">
                      אין סיבת בדיקה פעילה.
                    </p>
                  );
                }
                return (
                  <ul className="space-y-1.5 text-[13px]">
                    {reasons.map((code) => (
                      <li key={code}>{activeReviewReasonLabelHe(code)}</li>
                    ))}
                  </ul>
                );
              })()}
            </section>
          )}

          <section>
            <h3 className="mb-2 font-medium">בעיות ופעולות</h3>
            {row.issueCodes.length === 0 ? (
              <p className="text-muted-foreground">אין בעיות פתוחות.</p>
            ) : (
              <ul className="space-y-2">
                {row.issueCodes.map((code) => (
                  <li
                    key={code}
                    className="rounded-md border border-border/80 px-2 py-1.5"
                  >
                    {issueMessageHe(code, {
                      sourceWidthMm: row.source.sourceWidthMm,
                      sourceLengthMm: row.source.sourceLengthMm,
                      noDxfFilesUploaded,
                    })}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={onPickDxf}>
                שנה DXF
              </Button>
              {(row.issueCodes.includes("MANUAL_MATCH_NOT_CONFIRMED") ||
                row.issueCodes.includes("HEURISTIC_MATCH_UNCONFIRMED")) && (
                <Button type="button" size="sm" onClick={onConfirmManual}>
                  אשר התאמה
                </Button>
              )}
              {row.isExcluded ? (
                <Button type="button" size="sm" variant="outline" onClick={onRestore}>
                  החזר להצעה
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={onExclude}>
                  החרג מהצעה
                </Button>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-medium">מקור</h3>
            {row.source.sourceType === "PDF" ? (
              <div className="space-y-2 text-[13px]">
                <p>
                  מקור:{" "}
                  <span className="us-ltr inline-block" dir="ltr">
                    {row.source.workbookFilename}
                  </span>
                  {row.source.sourcePage != null
                    ? ` · עמוד ${row.source.sourcePage}`
                    : null}
                </p>
                {row.source.sourceAnchorText || row.source.sourceText ? (
                  <p className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed">
                    {row.source.sourceAnchorText || row.source.sourceText}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <dt className="text-muted-foreground">קובץ</dt>
                  <dd className="break-all">
                    <span className="us-ltr inline-block" dir="ltr">
                      {row.source.workbookFilename}
                    </span>
                  </dd>
                  <dt className="text-muted-foreground">גיליון</dt>
                  <dd>{row.source.sheetName}</dd>
                  <dt className="text-muted-foreground">שורה</dt>
                  <dd>{row.source.sourceRow}</dd>
                  <dt className="text-muted-foreground">תא</dt>
                  <dd>{row.source.sourceCell}</dd>
                </dl>
                {row.source.sourceText && (
                  <p className="mt-2 rounded-md bg-muted/40 p-2 text-xs leading-relaxed">
                    {row.source.sourceText}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(v);
}
