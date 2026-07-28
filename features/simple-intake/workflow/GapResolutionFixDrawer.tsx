"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Check,
  FileUp,
  Hash,
  Layers,
  Ruler,
  Tag,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  derivePanelMissingItemDetails,
  PANEL_MISSING_DETAIL_LABEL_HE,
  type PanelMissingItemDetail,
} from "../missingRequiredItemFields";
import { describeDimensionComparisonHe } from "../results/dimensionComparisonCopy";
import {
  deriveMaterialResolutionCategory,
  deriveRowResolutionPresentation,
} from "../results/primaryResolutionCategory";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";
import { getSourceItemIdentifier } from "../sourceItemIdentifier";
import { isQuoteItemFrozen } from "../quoteItemScope";
import { simpleIntakeActions } from "../sessionStore";

export const GAP_FIX_PANEL_WIDTH_PX = 380;
export const GAP_FIX_PANEL_MS = 400;
export const GAP_FIX_PANEL_GUTTER_PX = 40;
export const GAP_FIX_PANEL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type GuideOptionId =
  | "upload-dxf"
  | "fix-id"
  | "pick-dxf"
  | "fill-fields"
  | "use-dxf-dims"
  | "keep-review"
  | "ready";

function formatMm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

function GuideStep({
  icon: Icon,
  title,
  description,
  active,
  done,
  onSelect,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  active?: boolean;
  done?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}) {
  const interactive = Boolean(onSelect) && !done;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
      className={cn(
        "rounded-[18px] px-3.5 py-3.5 transition-[box-shadow,background-color,transform] duration-200",
        active
          ? "bg-white shadow-[0_8px_24px_rgba(16,24,40,0.10)] ring-1 ring-black/[0.04]"
          : "bg-[rgba(242,244,247,0.92)]",
        interactive && !active ? "cursor-pointer hover:bg-[rgba(242,244,247,1)]" : null
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            active ? "bg-[#EEF2F6]" : "bg-white/80"
          )}
          aria-hidden
        >
          <Icon
            className="h-[18px] w-[18px]"
            style={{
              color: active
                ? "var(--ow-text, #101828)"
                : "var(--ow-text-muted, #667085)",
            }}
            strokeWidth={1.75}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <p
              className="text-[14px] font-semibold leading-snug"
              style={{ color: "var(--ow-text, #101828)" }}
            >
              {title}
            </p>
            {done ? (
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--ow-text, #101828)" }}
                aria-label="הושלם"
              >
                <Check className="h-3 w-3 text-white" strokeWidth={3} />
              </span>
            ) : null}
          </div>
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: "var(--ow-text-secondary, #475467)" }}
          >
            {description}
          </p>
        </div>
      </div>
      {active && children ? (
        <div
          className="mt-3 space-y-2.5 border-t pt-3"
          style={{ borderColor: "rgba(228,231,236,0.9)" }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Guided fix panel — clear options with icons so the user knows what to do next.
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
  const [sourceLengthDraft, setSourceLengthDraft] = useState("");
  const [sourceWidthDraft, setSourceWidthDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOption, setActiveOption] = useState<GuideOptionId>("upload-dxf");

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
    setSourceLengthDraft(
      row.source.sourceLengthMm != null &&
        Number.isFinite(row.source.sourceLengthMm)
        ? String(row.source.sourceLengthMm)
        : ""
    );
    setSourceWidthDraft(
      row.source.sourceWidthMm != null &&
        Number.isFinite(row.source.sourceWidthMm)
        ? String(row.source.sourceWidthMm)
        : ""
    );
    setError(null);
    setBusy(false);

    const category = deriveMaterialResolutionCategory(row);
    const sourceId = getSourceItemIdentifier({
      partId: row.part.sourcePartId,
      dxfFileName: null,
    });
    if (category === "READY_FOR_PRICING") {
      setActiveOption("ready");
    } else if (category === "DIMENSION_REVIEW") {
      setActiveOption("use-dxf-dims");
    } else if (category === "MISSING_ITEM_DATA") {
      setActiveOption("fill-fields");
    } else if (!sourceId) {
      setActiveOption("fix-id");
    } else if (row.match.status === "AMBIGUOUS") {
      setActiveOption("pick-dxf");
    } else {
      setActiveOption("upload-dxf");
    }
  }, [open, row]);

  useEffect(() => {
    if (!open || !row) return;
    const t = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        )
        ?.focus({ preventScroll: true });
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

  const frozen = isQuoteItemFrozen(row);
  const presentation = deriveRowResolutionPresentation(row);
  const category = deriveMaterialResolutionCategory(row);
  const sourceId = getSourceItemIdentifier({
    partId: row.part.sourcePartId,
    dxfFileName: null,
  });
  const panelMissingDetails =
    category === "MISSING_ITEM_DATA"
      ? derivePanelMissingItemDetails(row)
      : [];
  const itemLabel =
    row.part.displayName?.trim() ||
    row.part.sourcePartId?.trim() ||
    "פריט ללא שם";

  const needsDxfUpload =
    category === "ITEM_IDENTIFICATION" &&
    Boolean(sourceId) &&
    row.match.status !== "AMBIGUOUS" &&
    (row.match.status === "UNMATCHED" ||
      row.match.status === "INVALID_DXF" ||
      row.issueCodes.includes("DXF_INVALID") ||
      row.issueCodes.includes("NO_DXF_FOUND"));

  async function handleUploadDxf(files: FileList | null): Promise<void> {
    if (frozen) return;
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
    if (frozen) return;
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
    if (frozen) return;
    const edits: {
      material?: string | null;
      thicknessMm?: number | null;
      quantity?: number | null;
      lengthMm?: number | null;
      widthMm?: number | null;
    } = {};
    let touched = 0;

    if (panelMissingDetails.includes("MATERIAL")) {
      const m = materialDraft.trim();
      if (m) {
        edits.material = m;
        touched += 1;
      }
    }
    if (panelMissingDetails.includes("THICKNESS")) {
      const raw = thicknessDraft.trim();
      if (raw) {
        const t = Number(raw.replace(",", "."));
        if (!Number.isFinite(t) || t <= 0) {
          setError("יש להזין עובי תקין.");
          return;
        }
        edits.thicknessMm = t;
        touched += 1;
      }
    }
    if (panelMissingDetails.includes("QUANTITY")) {
      const raw = quantityDraft.trim();
      if (raw) {
        const q = Number(raw.replace(",", "."));
        if (!Number.isFinite(q) || q <= 0) {
          setError("יש להזין כמות תקינה.");
          return;
        }
        edits.quantity = q;
        touched += 1;
      }
    }
    if (panelMissingDetails.includes("SOURCE_LENGTH")) {
      const raw = sourceLengthDraft.trim();
      if (raw) {
        const l = Number(raw.replace(",", "."));
        if (!Number.isFinite(l) || l <= 0) {
          setError("יש להזין אורך טבלה תקין.");
          return;
        }
        edits.lengthMm = l;
        touched += 1;
      }
    }
    if (panelMissingDetails.includes("SOURCE_WIDTH")) {
      const raw = sourceWidthDraft.trim();
      if (raw) {
        const w = Number(raw.replace(",", "."));
        if (!Number.isFinite(w) || w <= 0) {
          setError("יש להזין רוחב טבלה תקין.");
          return;
        }
        edits.widthMm = w;
        touched += 1;
      }
    }

    if (touched === 0) {
      setError("הזן לפחות שדה אחד לאישור — אפשר להשלים את השאר אחר כך.");
      return;
    }

    setError(null);
    simpleIntakeActions.updateRowEdits(row!.id, edits);
    if (edits.lengthMm != null || edits.widthMm != null) {
      simpleIntakeActions.rematchLocallyPreservingEdits();
    }
    onClose();
  }

  function selectCandidate(dxfId: string): void {
    if (trySelectDxf(row!.id, dxfId)) onClose();
  }

  function detailIcon(detail: PanelMissingItemDetail): LucideIcon {
    switch (detail) {
      case "MATERIAL":
        return Layers;
      case "THICKNESS":
        return Ruler;
      case "QUANTITY":
        return Hash;
      case "SOURCE_LENGTH":
      case "SOURCE_WIDTH":
        return Ruler;
    }
  }

  function detailDescription(detail: PanelMissingItemDetail): string {
    switch (detail) {
      case "MATERIAL":
        return "הזן את סוג החומר של הפלטה.";
      case "THICKNESS":
        return "הזן את עובי הפלטה במילימטרים.";
      case "QUANTITY":
        return "הזן כמה יחידות נדרשות מהפריט.";
      case "SOURCE_LENGTH":
        return "הזן את האורך כפי שמופיע בטבלה.";
      case "SOURCE_WIDTH":
        return "הזן את הרוחב כפי שמופיע בטבלה.";
    }
  }

  const comparison = row.dimensionComparison;
  const dimCopy = comparison ? describeDimensionComparisonHe(comparison) : null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-[14px] border"
      style={{
        width: GAP_FIX_PANEL_WIDTH_PX,
        maxHeight: "100%",
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor: "var(--ow-surface, #ffffff)",
        color: "var(--ow-text, #101828)",
        boxShadow: "var(--ow-shadow-md, 0 8px 24px rgba(16, 24, 40, 0.12))",
      }}
    >
      <header className="shrink-0 space-y-1.5 px-4 pt-4 pb-2">
        <p
          className="truncate text-[11px] font-medium tracking-wide"
          style={{ color: "var(--ow-text-muted, #667085)" }}
        >
          {itemLabel}
        </p>
        <h2
          id={titleId}
          className="text-[16px] font-semibold leading-snug"
          style={{ color: "var(--ow-text, #101828)" }}
        >
          {presentation.title}
        </h2>
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary, #475467)" }}
        >
          {presentation.description}
        </p>
        {frozen ? (
          <p
            className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed"
            style={{
              borderColor: "var(--ow-border)",
              backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
              color: "var(--ow-text-muted, #667085)",
            }}
          >
            הפריט מוקפא ואינו נכלל בהצעה. החזר אותו מהטבלה כדי לערוך שוב.
          </p>
        ) : (
          <p
            className="pt-1 text-[11px] font-semibold tracking-wide"
            style={{ color: "var(--ow-text-muted, #667085)" }}
          >
            בחר פעולה לתיקון
          </p>
        )}
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-2"
        aria-disabled={frozen}
        style={frozen ? { opacity: 0.55, pointerEvents: "none" } : undefined}
      >
        {category === "ITEM_IDENTIFICATION" && !sourceId ? (
          <GuideStep
            icon={Hash}
            title="השלם מזהה פריט"
            description="הזן את שם הפריט או מזהה הקובץ בדיוק כפי שמופיע ב-DXF."
            active={activeOption === "fix-id"}
            onSelect={() => setActiveOption("fix-id")}
          >
            <LabeledInput
              label="שם הפריט / מזהה"
              value={partIdDraft}
              onChange={setPartIdDraft}
              placeholder="לדוגמה: p1171"
            />
            <PrimaryButton disabled={busy} onClick={approvePartId}>
              אשר מזהה
            </PrimaryButton>
          </GuideStep>
        ) : null}

        {needsDxfUpload ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dxf,application/dxf,image/vnd.dxf"
              className="hidden"
              onChange={(e) => void handleUploadDxf(e.target.files)}
            />
            <GuideStep
              icon={FileUp}
              title={
                row.match.status === "INVALID_DXF"
                  ? "העלה DXF מחדש"
                  : "העלה קובץ DXF תואם"
              }
              description="הפעולה המומלצת — העלה את הקובץ שמתאים למזהה הפריט."
              active={activeOption === "upload-dxf"}
              onSelect={() => setActiveOption("upload-dxf")}
            >
              <PrimaryButton
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {busy ? "מעלה…" : "בחר קובץ להעלאה"}
              </PrimaryButton>
            </GuideStep>
            <GuideStep
              icon={Tag}
              title="תקן מזהה פריט"
              description="אם שם הפריט בטבלה שגוי — עדכן אותו כך שיתאים לקובץ הקיים."
              active={activeOption === "fix-id"}
              onSelect={() => setActiveOption("fix-id")}
            >
              <LabeledInput
                label="מזהה פריט"
                value={partIdDraft}
                onChange={setPartIdDraft}
                placeholder={sourceId?.rawValue ?? "לדוגמה: p1171"}
              />
              <PrimaryButton disabled={busy} onClick={approvePartId}>
                אשר מזהה
              </PrimaryButton>
            </GuideStep>
          </>
        ) : null}

        {category === "ITEM_IDENTIFICATION" &&
        row.match.status === "AMBIGUOUS" ? (
          <GuideStep
            icon={Layers}
            title="בחר קובץ DXF"
            description="נמצאו כמה קבצים עם אותו מזהה — בחר את הקובץ הנכון."
            active={activeOption === "pick-dxf"}
            onSelect={() => setActiveOption("pick-dxf")}
          >
            <div className="space-y-2">
              {candidates.slice(0, 4).map((c) => (
                <button
                  key={c.dxfId}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border bg-white px-3 py-2.5 text-start text-[13px] transition-colors hover:bg-[var(--ow-surface-muted)]"
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
                  className="h-10 w-full rounded-2xl"
                  onClick={onPickDxf}
                >
                  פתח רשימה מלאה
                </Button>
              ) : null}
            </div>
          </GuideStep>
        ) : null}

        {category === "MISSING_ITEM_DATA" ? (
          <div className="space-y-2.5">
            {panelMissingDetails.map((detail) => {
              const label = PANEL_MISSING_DETAIL_LABEL_HE[detail];
              const Icon = detailIcon(detail);
              return (
                <GuideStep
                  key={detail}
                  icon={Icon}
                  title={label}
                  description={detailDescription(detail)}
                  active
                >
                  {detail === "MATERIAL" ? (
                    <LabeledInput
                      label="סוג חומר"
                      value={materialDraft}
                      onChange={setMaterialDraft}
                      placeholder="לדוגמה: S235"
                    />
                  ) : null}
                  {detail === "THICKNESS" ? (
                    <LabeledInput
                      label="עובי (מ״מ)"
                      value={thicknessDraft}
                      onChange={setThicknessDraft}
                      placeholder="לדוגמה: 10"
                      inputMode="decimal"
                    />
                  ) : null}
                  {detail === "QUANTITY" ? (
                    <LabeledInput
                      label="כמות"
                      value={quantityDraft}
                      onChange={setQuantityDraft}
                      placeholder="לדוגמה: 4"
                      inputMode="numeric"
                    />
                  ) : null}
                  {detail === "SOURCE_LENGTH" ? (
                    <LabeledInput
                      label="אורך טבלה (מ״מ)"
                      value={sourceLengthDraft}
                      onChange={setSourceLengthDraft}
                      placeholder="לדוגמה: 1200"
                      inputMode="decimal"
                    />
                  ) : null}
                  {detail === "SOURCE_WIDTH" ? (
                    <LabeledInput
                      label="רוחב טבלה (מ״מ)"
                      value={sourceWidthDraft}
                      onChange={setSourceWidthDraft}
                      placeholder="לדוגמה: 800"
                      inputMode="decimal"
                    />
                  ) : null}
                </GuideStep>
              );
            })}
            {panelMissingDetails.length === 0 ? (
              <p
                className="text-[12px]"
                style={{ color: "var(--ow-text-secondary)" }}
              >
                אין שדות חסרים לתיקון מהיר.
              </p>
            ) : (
              <div className="space-y-2">
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: "var(--ow-text-muted)" }}
                >
                  אפשר לאשר שדה אחד עכשיו ולהשלים את השאר אחר כך.
                </p>
                <PrimaryButton onClick={approveMissingData}>
                  אשר שינויים
                </PrimaryButton>
              </div>
            )}
          </div>
        ) : null}

        {category === "DIMENSION_REVIEW" ? (
          <>
            <GuideStep
              icon={Ruler}
              title="השתמש במידות DXF"
              description={`טבלה: ${dimCopy?.sourceLabel ?? "—"} · DXF: ${dimCopy?.dxfLabel ?? "—"}`}
              active={activeOption === "use-dxf-dims"}
              onSelect={() => setActiveOption("use-dxf-dims")}
            >
              <PrimaryButton
                onClick={() => {
                  onUseDxfDimensions();
                  onClose();
                }}
              >
                אשר מידות DXF
              </PrimaryButton>
            </GuideStep>
            <GuideStep
              icon={Tag}
              title="השאר לבדיקה"
              description="אל תשנה כרגע — הפריט יישאר לטיפול מאוחר יותר."
              active={activeOption === "keep-review"}
              onSelect={() => setActiveOption("keep-review")}
            >
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-2xl"
                onClick={() => {
                  onKeepDimensionReview();
                  onClose();
                }}
              >
                השאר לבדיקה
              </Button>
            </GuideStep>
          </>
        ) : null}

        {category === "READY_FOR_PRICING" ? (
          <GuideStep
            icon={Check}
            title="מוכן לתמחור"
            description="כל הנתונים הנדרשים קיימים. אין פעולת תיקון."
            active
            done
          />
        ) : null}

        {error ? (
          <p
            className="text-[12px] leading-snug"
            style={{ color: "var(--ow-danger, #b42318)" }}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>

      <footer className="shrink-0 px-4 pt-2 pb-4">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-2xl text-[13px]"
          onClick={onClose}
        >
          ביטול
        </Button>
      </footer>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      className="h-11 w-full gap-2 rounded-2xl text-[14px] font-medium"
      style={{
        backgroundColor: "var(--ow-accent, #0f766e)",
        color: "var(--ow-accent-fg, #ffffff)",
      }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
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
        style={{ color: "var(--ow-text-secondary, #475467)" }}
      >
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-10 rounded-2xl bg-white"
      />
    </label>
  );
}
