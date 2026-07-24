"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDxfDims } from "../results/commercialCalculations";
import { SimpleDxfThumbnail } from "../results/SimpleDxfThumbnail";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";
import { guidedIssueCopy } from "./guidedMessages";
import { GuidedReviewProgress } from "./GuidedReviewProgress";
import type { GuidedQueueItem } from "./types";

function RowFacts({
  row,
  showDims = true,
}: {
  row: FinalIntakeRow;
  showDims?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-sm">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        פרטי השורה
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">חלק / פרופיל</dt>
        <dd>
          {row.part.displayName}
          {row.part.sourceProfile &&
            row.part.sourceProfile !== row.part.displayName && (
              <span className="text-muted-foreground">
                {" "}
                · {row.part.sourceProfile}
              </span>
            )}
        </dd>
        <dt className="text-muted-foreground">חומר</dt>
        <dd>{row.material ?? "—"}</dd>
        <dt className="text-muted-foreground">עובי</dt>
        <dd>
          {row.thicknessMm != null ? `${row.thicknessMm} מ״מ` : "—"}
        </dd>
        <dt className="text-muted-foreground">כמות</dt>
        <dd>{row.quantity ?? "—"}</dd>
        {showDims && (
          <>
            <dt className="text-muted-foreground">מידות מקור</dt>
            <dd>
              {formatDxfDims(
                row.source.sourceWidthMm,
                row.source.sourceLengthMm
              )}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function diffText(c: FinalDxfCandidate): string | null {
  const parts: string[] = [];
  if (c.widthDifferenceMm != null && Number.isFinite(c.widthDifferenceMm)) {
    parts.push(`${fmtDiff(c.widthDifferenceMm)} מ״מ ברוחב`);
  }
  if (c.lengthDifferenceMm != null && Number.isFinite(c.lengthDifferenceMm)) {
    parts.push(`${fmtDiff(c.lengthDifferenceMm)} מ״מ באורך`);
  }
  if (parts.length === 0) return null;
  return `הפרש מהמקור: ${parts.join(", ")}`;
}

function fmtDiff(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function GuidedIssueReview({
  row,
  queueItem,
  progressIndex,
  progressTotal,
  allCandidates,
  duplicateRows,
  onSkip,
  onShowTable,
  onSaveMaterial,
  onSaveThickness,
  onSaveQuantity,
  onConfirmDxf,
  onConfirmManualMatch,
  onExclude,
  onUploadDxfs,
  onKeepDuplicateOnThisRow,
  onReleaseDxf,
}: {
  row: FinalIntakeRow;
  queueItem: GuidedQueueItem;
  progressIndex: number;
  progressTotal: number;
  allCandidates: FinalDxfCandidate[];
  duplicateRows: FinalIntakeRow[];
  onSkip: () => void;
  onShowTable: () => void;
  onSaveMaterial: (value: string) => void;
  onSaveThickness: (value: number) => void;
  onSaveQuantity: (value: number) => void;
  onConfirmDxf: (dxfId: string) => void;
  onConfirmManualMatch: () => void;
  onExclude: () => void;
  onUploadDxfs: (files: FileList) => void;
  onKeepDuplicateOnThisRow: () => void;
  onReleaseDxf: () => void;
}) {
  const code = queueItem.primaryIssue;
  const copy = guidedIssueCopy(code);
  const fileRef = useRef<HTMLInputElement>(null);

  const candidates =
    row.match.candidates.length > 0 ? row.match.candidates : allCandidates;

  return (
    <div className="mx-auto w-full max-w-xl space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">השלמת פרטים</h2>
        <Button type="button" variant="outline" size="sm" onClick={onShowTable}>
          הצג טבלה מלאה
        </Button>
      </div>

      <GuidedReviewProgress
        current={progressIndex}
        total={progressTotal}
      />

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">{copy.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{copy.explanation}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RowFacts
            row={row}
            showDims={
              code === "NO_DXF_FOUND" ||
              code === "MULTIPLE_DXF_CANDIDATES" ||
              code === "PART_ID_DIMENSION_MISMATCH" ||
              code === "DXF_ASSIGNED_TO_BETTER_ROW"
            }
          />

          {code === "MULTIPLE_DXF_CANDIDATES" && (
            <CandidatePickerBlock
              candidates={candidates}
              onConfirm={onConfirmDxf}
            />
          )}

          {code === "MANUAL_MATCH_NOT_CONFIRMED" && (
            <div className="space-y-2">
              {row.part.matchedDxfFilename && (
                <p className="text-sm">
                  קובץ שנבחר:{" "}
                  <span className="font-medium">
                    {row.part.matchedDxfFilename}
                  </span>
                </p>
              )}
              <Button type="button" size="lg" className="w-full" onClick={onConfirmManualMatch}>
                אשר התאמה
              </Button>
            </div>
          )}

          {code === "NO_DXF_FOUND" && (
            <NoDxfActions
              allCandidates={allCandidates}
              onConfirm={onConfirmDxf}
              onUpload={onUploadDxfs}
              onExclude={onExclude}
            />
          )}

          {code === "DXF_ASSIGNED_TO_BETTER_ROW" && (
            <div className="flex flex-col gap-2">
              <CandidatePickerBlock
                candidates={allCandidates}
                onConfirm={onConfirmDxf}
                confirmLabel="בחר DXF אחר"
              />
              <input
                ref={fileRef}
                type="file"
                accept=".dxf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUploadDxfs(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                העלה DXF נוסף
              </Button>
              <Button type="button" variant="outline" onClick={onExclude}>
                החרג מההצעה
              </Button>
            </div>
          )}

          {code === "DXF_INVALID" && (
            <div className="flex flex-col gap-2">
              {row.part.matchedDxfFilename && (
                <p className="text-sm text-muted-foreground">
                  קובץ: {row.part.matchedDxfFilename}
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".dxf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUploadDxfs(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="lg"
                onClick={() => fileRef.current?.click()}
              >
                העלה קובץ חלופי
              </Button>
              <CandidatePickerBlock
                candidates={allCandidates.filter(
                  (c) => c.dxfId !== row.part.matchedDxfId
                )}
                onConfirm={onConfirmDxf}
                confirmLabel="בחר DXF אחר"
              />
              <Button type="button" variant="outline" onClick={onExclude}>
                החרג מההצעה
              </Button>
            </div>
          )}

          {code === "MISSING_MATERIAL" && (
            <FieldSave
              label="חומר"
              inputMode="text"
              validate={(raw) => {
                const t = raw.trim();
                if (!t) return { ok: false, error: "יש להזין סוג חומר." };
                return { ok: true, value: t };
              }}
              onSave={(v) => onSaveMaterial(String(v))}
            />
          )}

          {code === "MISSING_THICKNESS" && (
            <FieldSave
              label="עובי במ״מ"
              inputMode="decimal"
              validate={(raw) => {
                const n = Number(String(raw).replace(",", "."));
                if (!Number.isFinite(n) || !(n > 0)) {
                  return {
                    ok: false,
                    error: "יש להזין עובי גדול מאפס.",
                  };
                }
                return { ok: true, value: n };
              }}
              onSave={(v) => onSaveThickness(Number(v))}
            />
          )}

          {code === "MISSING_QUANTITY" && (
            <FieldSave
              label="כמות"
              inputMode="numeric"
              validate={(raw) => {
                const n = Number(raw);
                if (!Number.isInteger(n) || !(n > 0)) {
                  return {
                    ok: false,
                    error: "יש להזין מספר יחידות גדול מאפס.",
                  };
                }
                return { ok: true, value: n };
              }}
              onSave={(v) => onSaveQuantity(Number(v))}
            />
          )}

          {code === "PART_ID_DIMENSION_MISMATCH" && (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 text-sm">
                {row.dimensionComparison ? (
                  <>
                    <div>
                      מידות ברשימת החומר:{" "}
                      {formatDxfDims(
                        row.dimensionComparison.source.widthMm,
                        row.dimensionComparison.source.lengthMm
                      )}
                    </div>
                    <div className="mt-1">
                      מידות בקובץ ה-DXF:{" "}
                      {formatDxfDims(
                        row.dimensionComparison.dxf.widthMm,
                        row.dimensionComparison.dxf.lengthMm
                      )}
                    </div>
                    {row.dimensionComparison.orientation === "ROTATED" ? (
                      <div className="mt-1 text-muted-foreground">
                        המידות הושוו ללא תלות בכיוון.
                      </div>
                    ) : null}
                    <div className="mt-1">
                      נמצא פער משמעותי במידות (הפרש מרבי:{" "}
                      {row.dimensionComparison.maxAbsoluteDifferenceMm.toLocaleString(
                        "he-IL",
                        { maximumFractionDigits: 2 }
                      )}{" "}
                      מ״מ).
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      מידות בקובץ החומרים:{" "}
                      {formatDxfDims(
                        row.source.sourceWidthMm,
                        row.source.sourceLengthMm
                      )}
                    </div>
                    <div className="mt-1">
                      מידות בקובץ ה-DXF:{" "}
                      {formatDxfDims(
                        row.rawDxfDimensions?.widthMm ??
                          row.dxfDimensions.widthMm,
                        row.rawDxfDimensions?.lengthMm ??
                          row.dxfDimensions.lengthMm
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {row.part.matchedDxfId && (
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => onConfirmDxf(row.part.matchedDxfId!)}
                  >
                    השתמש ב-DXF הזה
                  </Button>
                )}
                <CandidatePickerBlock
                  candidates={allCandidates.filter(
                    (c) => c.dxfId !== row.part.matchedDxfId
                  )}
                  onConfirm={onConfirmDxf}
                  confirmLabel="בחר DXF אחר"
                />
                <Button type="button" variant="outline" onClick={onExclude}>
                  החרג מההצעה
                </Button>
              </div>
            </div>
          )}

          {code === "DUPLICATE_DXF_USAGE" && (
            <div className="space-y-3">
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">שורות שמתייחסות לאותו קובץ:</p>
                <ul className="space-y-1">
                  {duplicateRows.map((r) => (
                    <li
                      key={r.id}
                      className="rounded border border-border/70 px-2 py-1"
                    >
                      {r.part.displayName} · שורה {r.source.sourceRow} · כמות{" "}
                      {r.quantity ?? "—"}
                      {r.id === row.id ? " (נוכחית)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" onClick={onKeepDuplicateOnThisRow}>
                  השאר את הקובץ לשורה זו
                </Button>
                <CandidatePickerBlock
                  candidates={allCandidates.filter(
                    (c) => c.dxfId !== row.part.matchedDxfId
                  )}
                  onConfirm={onConfirmDxf}
                  confirmLabel="בחר קובץ אחר לשורה זו"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept=".dxf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) onUploadDxfs(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  העלה DXF נוסף
                </Button>
                <Button type="button" variant="outline" onClick={onExclude}>
                  החרג מההצעה
                </Button>
                <Button type="button" variant="ghost" onClick={onReleaseDxf}>
                  הסר שיוך מהשורה הזו
                </Button>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onSkip}
          >
            טפל אחר כך
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NoDxfActions({
  allCandidates,
  onConfirm,
  onUpload,
  onExclude,
}: {
  allCandidates: FinalDxfCandidate[];
  onConfirm: (dxfId: string) => void;
  onUpload: (files: FileList) => void;
  onExclude: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".dxf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        size="lg"
        onClick={() => fileRef.current?.click()}
      >
        העלה קובצי DXF נוספים
      </Button>
      {!picking ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setPicking(true)}
        >
          בחר DXF ידנית
        </Button>
      ) : (
        <CandidatePickerBlock
          candidates={allCandidates}
          onConfirm={onConfirm}
          emptyLabel="אין קבצים לבחירה ידנית כרגע."
        />
      )}
      <Button type="button" variant="outline" onClick={onExclude}>
        החרג מההצעה
      </Button>
    </div>
  );
}

function FieldSave({
  label,
  inputMode,
  validate,
  onSave,
}: {
  label: string;
  inputMode: "text" | "decimal" | "numeric";
  validate: (
    raw: string
  ) => { ok: true; value: string | number } | { ok: false; error: string };
  onSave: (value: string | number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="guided-field">{label}</Label>
        <Input
          id="guided-field"
          value={draft}
          inputMode={inputMode}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          aria-invalid={error != null}
          className={error ? "border-destructive" : undefined}
        />
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={() => {
          const result = validate(draft);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onSave(result.value);
        }}
      >
        שמור והמשך
      </Button>
    </div>
  );
}

function CandidatePickerBlock({
  candidates,
  onConfirm,
  emptyLabel = "אין קבצים זמינים.",
  confirmLabel = "בחר קובץ זה",
}: {
  candidates: FinalDxfCandidate[];
  onConfirm: (dxfId: string) => void;
  emptyLabel?: string;
  confirmLabel?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(() => candidates, [candidates]);

  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2" role="listbox" aria-label="בחירת DXF">
        {list.map((c) => {
          const active = selected === c.dxfId;
          const diff = diffText(c);
          return (
            <li key={c.dxfId}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => setSelected(c.dxfId)}
                className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <SimpleDxfThumbnail
                  widthMm={c.widthMm}
                  lengthMm={c.lengthMm}
                  size="sm"
                  label={`תצוגה ${c.filename}`}
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDxfDims(c.widthMm, c.lengthMm)}
                  </div>
                  {diff && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {diff}
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!selected}
        onClick={() => selected && onConfirm(selected)}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
