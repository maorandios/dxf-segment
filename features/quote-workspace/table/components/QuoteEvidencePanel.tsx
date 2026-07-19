"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { ReviewIssue } from "@/lib/ai-intake/review";
import {
  formatAreaM2,
  formatInteger,
  formatMassKg,
  formatMaterial,
  formatMeasurementMm,
  fieldStateLabelHe,
  issueSeverityLabelHe,
} from "../quoteTableFormatting";
import {
  buildEvidenceFieldBlocks,
  buildValidationChecks,
  dxfMatchStatusLabelHe,
  geometryStatusLabelHe,
} from "../quoteTableEvidence";
import type { QuoteTableRowViewModel } from "../types";
import { QuoteRowStatusBadge } from "./QuoteRowStatusBadge";

function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

export function QuoteEvidencePanel(props: {
  row: QuoteTableRowViewModel;
  issues: ReviewIssue[];
  onClose: () => void;
  onToggleInclude: (include: boolean) => void;
  variant?: "side" | "sheet";
}) {
  const { row } = props;
  const source = row.sourceRow;
  const fields = buildEvidenceFieldBlocks(source);
  const checks = buildValidationChecks(source);
  const match = source.dxfMatch;
  const geomStatus =
    match.status === "MATCHED" ? match.geometryStatus : null;

  return (
    <aside
      className={
        props.variant === "sheet"
          ? "flex max-h-[85vh] flex-col rounded-t-[16px] border border-white/10 bg-background p-4 shadow-lg"
          : "flex h-full min-h-0 flex-col rounded-[12px] border border-white/10 bg-white/[0.02] p-4"
      }
      aria-labelledby="quote-evidence-heading"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2
            id="quote-evidence-heading"
            className="text-base font-semibold tracking-tight"
          >
            פרטי חלק
          </h2>
          <p className="text-sm text-muted-foreground">
            {row.displayPartReference}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="סגור פאנל פרטים"
          onClick={props.onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pe-1">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">סיכום</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">כמות</dt>
              <dd>{formatInteger(row.quantity)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">חומר</dt>
              <dd>{formatMaterial(row.material)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">עובי</dt>
              <dd>{formatMeasurementMm(row.thicknessMm)} מ״מ</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">מידות</dt>
              <dd>
                {formatMeasurementMm(row.widthMm)} ×{" "}
                {formatMeasurementMm(row.heightMm)}
              </dd>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <QuoteRowStatusBadge status={row.presentationStatus} />
            </div>
          </dl>
          <div className="flex items-center gap-2 pt-1">
            <Switch
              id={`include-${row.rowId}`}
              checked={row.includeInQuote}
              onCheckedChange={props.onToggleInclude}
            />
            <Label htmlFor={`include-${row.rowId}`}>כלול בהצעה</Label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">מסמך מקור</h3>
          {(() => {
            const sourceProfile = source.rawPartReferences.find(
              (r) => r !== row.displayPartReference
            );
            return sourceProfile ? (
              <div className="rounded-[10px] border border-white/10 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">פרופיל מקור</p>
                <p className="font-medium">{sourceProfile}</p>
              </div>
            ) : null;
          })()}
          {fields.map((f) => (
            <div
              key={f.fieldKey}
              className="rounded-[10px] border border-white/10 px-3 py-2 text-sm"
            >
              <p className="font-medium">{f.labelHe}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                המערכת הציעה: {fmtVal(f.proposedValue)}
              </p>
              <p className="text-xs">
                הערך הנוכחי: {fmtVal(f.currentValue)}
              </p>
              {f.editedByUser && (
                <p className="text-xs text-muted-foreground">שונה ידנית</p>
              )}
              {fieldStateLabelHe(f.state) && (
                <p className="text-xs text-muted-foreground">
                  {fieldStateLabelHe(f.state)}
                </p>
              )}
              {f.sourceRefs.map((r, i) => (
                <p key={i} className="mt-1 text-xs text-muted-foreground">
                  {[
                    r.fileName,
                    r.sheetName,
                    r.rowNumber != null ? `שורה ${r.rowNumber}` : null,
                    r.cellReferences?.join(", "),
                    r.originalValue != null
                      ? `מקור: ${String(r.originalValue)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ))}
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">התאמת DXF</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">קובץ</dt>
              <dd>
                {match.status === "MATCHED"
                  ? match.candidates[0]?.fileName ?? "—"
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">מזהה</dt>
              <dd>{row.matchedDxfPartId ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">סטטוס</dt>
              <dd>{dxfMatchStatusLabelHe(match.status)}</dd>
            </div>
            {row.dxfMatchReason && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">סיבת התאמה</dt>
                <dd className="text-end text-xs">{row.dxfMatchReason}</dd>
              </div>
            )}
            {row.dxfMatchMethod && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">שיטה</dt>
                <dd>{row.dxfMatchMethod}</dd>
              </div>
            )}
            {match.status === "AMBIGUOUS" && row.dxfCandidateCount > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">
                  מועמדים ({row.dxfCandidateCount}) · בחר DXF
                </p>
                <ul className="space-y-1.5">
                  {source.dxfCandidates.map((c) => (
                    <li
                      key={c.registryEntryId ?? c.partId}
                      className="rounded-[8px] bg-white/[0.04] px-2 py-1.5 text-xs"
                    >
                      <div className="font-medium">{c.partId}</div>
                      <div className="text-muted-foreground">{c.fileName}</div>
                      {typeof c.score === "number" && (
                        <div className="tabular-nums text-muted-foreground">
                          ציון {c.score.toFixed(3)}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {match.status === "MATCHED" &&
              row.displayPartReference &&
              !source.rawPartReferences.includes(row.displayPartReference) && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">שיטת התאמה</dt>
                <dd>התאמה לפי מידות</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">גאומטריה</dt>
              <dd>{geometryStatusLabelHe(geomStatus)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">רוחב</dt>
              <dd>{formatMeasurementMm(row.widthMm)} מ״מ</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">אורך</dt>
              <dd>{formatMeasurementMm(row.heightMm)} מ״מ</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">שטח פלטה</dt>
              <dd>{formatAreaM2(row.plateAreaM2)} מ״ר</dd>
            </div>
            {source.dxfGeometry?.netContourAreaMm2 != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">קונטור נטו</dt>
                <dd>
                  {formatAreaM2(
                    source.dxfGeometry.netContourAreaMm2 / 1_000_000
                  )}{" "}
                  מ״ר
                </dd>
              </div>
            )}
          </dl>
        </section>

        {checks.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">בדיקות</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {checks.map((c) => (
                <li key={c.id}>✓ {c.labelHe}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">בעיות</h3>
          {props.issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין בעיות פתוחות</p>
          ) : (
            <ul className="space-y-2">
              {props.issues.map((issue) => (
                <li
                  key={issue.issueId}
                  className="rounded-[10px] border border-white/10 px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    <span className="text-xs text-muted-foreground">
                      [{issueSeverityLabelHe(issue.severity)}]
                    </span>{" "}
                    {issue.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {issue.message}
                  </p>
                  {issue.field && (
                    <p className="mt-0.5 text-xs">שדה: {issue.field}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {(row.unitWeightKg != null || row.totalWeightKg != null) && (
          <section className="space-y-1 text-sm">
            <h3 className="text-sm font-medium">משקל מקור</h3>
            <p>יחידה: {formatMassKg(row.unitWeightKg)} ק״ג</p>
            <p>כולל: {formatMassKg(row.totalWeightKg)} ק״ג</p>
          </section>
        )}
      </div>
    </aside>
  );
}
