"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deriveMissingRequiredItemFields } from "../missingRequiredItemFields";
import { describeDimensionComparisonHe } from "../results/dimensionComparisonCopy";
import {
  deriveMaterialResolutionCategory,
  deriveRowResolutionPresentation,
} from "../results/primaryResolutionCategory";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";
import { getSourceItemIdentifier } from "../sourceItemIdentifier";
import { simpleIntakeActions } from "../sessionStore";

export const GAP_FIX_PANEL_WIDTH_PX = 360;
export const GAP_FIX_PANEL_MS = 320;
/** Visual gutter between far-left panel and main view */
export const GAP_FIX_PANEL_GUTTER_PX = 40;

function formatMm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

/**
 * Inline fix panel body (no fixed overlay). Parent owns push layout + slide.
 */
export function GapResolutionFixDrawer({
  row,
  open,
  onClose,
  onPickDxf,
  onUseDxfDimensions,
  onKeepDimensionReview,
  trySelectDxf,
  candidates,
}: {
  row: FinalIntakeRow | null;
  open: boolean;
  onClose: () => void;
  onPickDxf: () => void;
  onUseDxfDimensions: () => void;
  onKeepDimensionReview: () => void;
  trySelectDxf: (resultRowId: string, dxfId: string | null) => boolean;
  candidates: FinalDxfCandidate[];
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [partIdDraft, setPartIdDraft] = useState("");
  const [materialDraft, setMaterialDraft] = useState("");
  const [thicknessDraft, setThicknessDraft] = useState("");
  const [quantityDraft, setQuantityDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setPartIdDraft(row.part.sourcePartId?.trim() || "");
    setMaterialDraft(row.material?.trim() || "");
    setThicknessDraft(
      row.thicknessMm != null && Number.isFinite(row.thicknessMm)
        ? String(row.thicknessMm)
        : ""
    );
    setQuantityDraft(
      row.quantity != null && Number.isFinite(row.quantity)
        ? String(row.quantity)
        : ""
    );
    setError(null);
    setBusy(false);
  }, [open, row]);

  useEffect(() => {
    if (!open || !row) return;
    const t = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        )
        ?.focus();
    }, 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, row, onClose]);

  if (!row) return null;

  const presentation = deriveRowResolutionPresentation(row);
  const category = deriveMaterialResolutionCategory(row);
  const sourceId = getSourceItemIdentifier({
    partId: row.part.sourcePartId,
    dxfFileName: null,
  });
  const missingFields =
    category === "MISSING_ITEM_DATA"
      ? deriveMissingRequiredItemFields(row).filter(
          (f) => f !== "FINAL_DIMENSIONS"
        )
      : [];
  const itemLabel =
    row.part.displayName?.trim() ||
    row.part.sourcePartId?.trim() ||
    "פריט ללא שם";

  async function handleUploadDxf(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await simpleIntakeActions.appendDxfFilesAndRematch(
        Array.from(files)
      );
      if (result.added === 0) {
        setError("לא נוספו קבצים חדשים. בדוק שהקובץ הוא DXF ושאינו קיים כבר.");
        return;
      }
      onClose();
    } catch {
      setError("העלאת הקובץ נכשלה. נסה שוב.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function approvePartId(): void {
    const next = partIdDraft.trim();
    if (!next) {
      setError("יש להזין שם פריט או מזהה.");
      return;
    }
    simpleIntakeActions.updateRowEdits(row!.id, { partId: next });
    simpleIntakeActions.rematchLocallyPreservingEdits();
    onClose();
  }

  function approveMissingData(): void {
    const edits: {
      material?: string | null;
      thicknessMm?: number | null;
      quantity?: number | null;
    } = {};

    if (missingFields.includes("MATERIAL")) {
      const m = materialDraft.trim();
      if (!m) {
        setError("יש להזין סוג חומר.");
        return;
      }
      edits.material = m;
    }
    if (missingFields.includes("THICKNESS")) {
      const t = Number(thicknessDraft.replace(",", "."));
      if (!Number.isFinite(t) || t <= 0) {
        setError("יש להזין עובי תקין.");
        return;
      }
      edits.thicknessMm = t;
    }
    if (missingFields.includes("QUANTITY")) {
      const q = Number(quantityDraft.replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) {
        setError("יש להזין כמות תקינה.");
        return;
      }
      edits.quantity = q;
    }

    simpleIntakeActions.updateRowEdits(row!.id, edits);
    onClose();
  }

  function selectCandidate(dxfId: string): void {
    if (trySelectDxf(row!.id, dxfId)) onClose();
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[var(--ow-radius-lg)] border"
      style={{
        width: GAP_FIX_PANEL_WIDTH_PX,
        borderColor: "var(--ow-border)",
        backgroundColor: "rgba(255, 255, 255, 0.15)",
      }}
    >
      {/* Header — short issue explainer */}
      <header className="shrink-0 space-y-2 px-4 pt-4 pb-3">
        <p
          className="truncate text-[12px] font-medium"
          style={{ color: "var(--ow-text-muted)" }}
        >
          {itemLabel}
        </p>
        <h2
          id={titleId}
          className="text-[16px] font-semibold leading-snug"
          style={{ color: "var(--ow-text)" }}
        >
          {presentation.title}
        </h2>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {presentation.description}
        </p>
      </header>

      {/* Body — fix action only */}
      <div className="flex min-h-0 flex-1 flex-col justify-start gap-3 overflow-hidden px-4 py-1">
          {category === "ITEM_IDENTIFICATION" && !sourceId ? (
            <FixField
              label="שם הפריט / מזהה"
              value={partIdDraft}
              onChange={setPartIdDraft}
              placeholder="לדוגמה: p1171"
              onApprove={approvePartId}
              approveLabel="אשר מזהה"
              disabled={busy}
            />
          ) : null}

          {category === "ITEM_IDENTIFICATION" && sourceId ? (
            <>
              {(row.match.status === "UNMATCHED" ||
                row.match.status === "INVALID_DXF" ||
                row.issueCodes.includes("DXF_INVALID") ||
                row.issueCodes.includes("NO_DXF_FOUND")) &&
              row.match.status !== "AMBIGUOUS" ? (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".dxf,application/dxf,image/vnd.dxf"
                    className="hidden"
                    onChange={(e) => void handleUploadDxf(e.target.files)}
                  />
                  <Button
                    type="button"
                    className="h-11 w-full gap-2 rounded-xl text-[14px]"
                    style={{
                      backgroundColor: "var(--ow-accent)",
                      color: "var(--ow-accent-fg)",
                    }}
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {busy
                      ? "מעלה…"
                      : row.match.status === "INVALID_DXF"
                        ? "העלה DXF מחדש"
                        : "העלה קובץ DXF תואם"}
                  </Button>
                  <FixField
                    label="או תקן מזהה פריט"
                    value={partIdDraft}
                    onChange={setPartIdDraft}
                    placeholder={sourceId.rawValue}
                    onApprove={approvePartId}
                    approveLabel="אשר מזהה"
                    disabled={busy}
                    compact
                  />
                </div>
              ) : null}

              {row.match.status === "AMBIGUOUS" ? (
                <div className="space-y-2">
                  {candidates.slice(0, 4).map((c) => (
                    <button
                      key={c.dxfId}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start text-[13px] transition-colors hover:bg-[var(--ow-surface-muted)]"
                      style={{ borderColor: "var(--ow-border)" }}
                      onClick={() => selectCandidate(c.dxfId)}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {c.filename || c.partId}
                      </span>
                      <span
                        className="shrink-0 tabular-nums text-[12px]"
                        style={{ color: "var(--ow-text-muted)" }}
                      >
                        {formatMm(c.lengthMm)}×{formatMm(c.widthMm)}
                      </span>
                    </button>
                  ))}
                  {candidates.length > 4 || candidates.length === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full rounded-xl"
                      onClick={onPickDxf}
                    >
                      בחר קובץ מהרשימה
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {category === "MISSING_ITEM_DATA" ? (
            <div className="space-y-3">
              {missingFields.includes("MATERIAL") ? (
                <LabeledInput
                  label="סוג חומר"
                  value={materialDraft}
                  onChange={setMaterialDraft}
                  placeholder="לדוגמה: S235"
                />
              ) : null}
              {missingFields.includes("THICKNESS") ? (
                <LabeledInput
                  label="עובי (מ״מ)"
                  value={thicknessDraft}
                  onChange={setThicknessDraft}
                  placeholder="לדוגמה: 10"
                  inputMode="decimal"
                />
              ) : null}
              {missingFields.includes("QUANTITY") ? (
                <LabeledInput
                  label="כמות"
                  value={quantityDraft}
                  onChange={setQuantityDraft}
                  placeholder="לדוגמה: 4"
                  inputMode="numeric"
                />
              ) : null}
              {missingFields.length === 0 ? (
                <p
                  className="text-[13px]"
                  style={{ color: "var(--ow-text-secondary)" }}
                >
                  אין שדות חסרים לתיקון מהיר. בדוק מידות בטבלה.
                </p>
              ) : (
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl text-[14px]"
                  style={{
                    backgroundColor: "var(--ow-accent)",
                    color: "var(--ow-accent-fg)",
                  }}
                  onClick={approveMissingData}
                >
                  אשר
                </Button>
              )}
            </div>
          ) : null}

          {category === "DIMENSION_REVIEW" ? (
            <DimensionFix
              row={row}
              onUseDxf={() => {
                onUseDxfDimensions();
                onClose();
              }}
              onKeep={() => {
                onKeepDimensionReview();
                onClose();
              }}
            />
          ) : null}

          {category === "READY_FOR_PRICING" ? (
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--ow-text-secondary)" }}
            >
              אין פעולת תיקון נדרשת.
            </p>
          ) : null}

          {error ? (
            <p
              className="shrink-0 text-[12px] leading-snug"
              style={{ color: "var(--ow-danger, #b42318)" }}
              role="alert"
            >
              {error}
            </p>
          ) : null}
      </div>

      {/* Bottom — cancel */}
      <footer className="shrink-0 px-4 pt-3 pb-4">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-xl text-[13px]"
          onClick={onClose}
        >
          ביטול
        </Button>
      </footer>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block space-y-1.5">
      <span
        className="text-[12px] font-medium"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-10 rounded-xl"
      />
    </label>
  );
}

function FixField({
  label,
  value,
  onChange,
  placeholder,
  onApprove,
  approveLabel,
  disabled,
  compact,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onApprove: () => void;
  approveLabel: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-2", compact && "pt-1")}>
      <LabeledInput
        label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <Button
        type="button"
        className="h-10 w-full rounded-xl text-[13px]"
        style={{
          backgroundColor: compact ? undefined : "var(--ow-accent)",
          color: compact ? undefined : "var(--ow-accent-fg)",
        }}
        variant={compact ? "outline" : "default"}
        disabled={disabled}
        onClick={onApprove}
      >
        {approveLabel}
      </Button>
    </div>
  );
}

function DimensionFix({
  row,
  onUseDxf,
  onKeep,
}: {
  row: FinalIntakeRow;
  onUseDxf: () => void;
  onKeep: () => void;
}) {
  const comparison = row.dimensionComparison;
  const copy = comparison ? describeDimensionComparisonHe(comparison) : null;

  return (
    <div className="space-y-3">
      <div
        className="space-y-1.5 rounded-xl border px-3 py-2.5 text-[13px]"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
        }}
      >
        <p>
          מידות טבלה:{" "}
          <span className="font-medium tabular-nums">
            {copy?.sourceLabel ??
              `${formatMm(row.source.sourceLengthMm)}×${formatMm(row.source.sourceWidthMm)}`}
          </span>
        </p>
        <p>
          מידות DXF:{" "}
          <span className="font-medium tabular-nums">
            {copy?.dxfLabel ??
              `${formatMm(row.rawDxfDimensions.lengthMm ?? row.dxfDimensions.lengthMm)}×${formatMm(row.rawDxfDimensions.widthMm ?? row.dxfDimensions.widthMm)}`}
          </span>
        </p>
      </div>
      <Button
        type="button"
        className="h-11 w-full rounded-xl text-[14px]"
        style={{
          backgroundColor: "var(--ow-accent)",
          color: "var(--ow-accent-fg)",
        }}
        onClick={onUseDxf}
      >
        השתמש במידות DXF
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full rounded-xl"
        onClick={onKeep}
      >
        השאר לבדיקה
      </Button>
    </div>
  );
}
