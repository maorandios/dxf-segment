"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  Eye,
  Hash,
  Layers,
  LayoutGrid,
  MoveHorizontal,
  MoveVertical,
  Package,
  Palette,
  RotateCcw,
  Search,
  Square,
  Tag,
  Trash2,
  Weight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DxfPartGeometry } from "@/types";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { jobSummaryFromParts } from "../lib/deriveQuoteSelection";
import { formatDecimal, formatInteger } from "@/lib/formatNumbers";
import {
  formatQuickQuoteCurrency,
  formatQuickQuoteCurrencyAmount,
  quickQuoteCurrencySymbol,
} from "../lib/quickQuoteCurrencies";
import type { MaterialType } from "@/types/materials";
import {
  materialPricingRowKey,
  parseMaterialPricePerKg,
} from "../job-overview/materialCalculations";
import { splitMaterialGradeAndFinish } from "../lib/plateFields";
import { formatUnifiedSourceForRow, formatUnifiedSourceLabel } from "../lib/unifiedSourceColumnLabel";
import type { QuotePartRow } from "../types/quickQuote";
import { QuotePartGeometryPreview } from "./QuotePartGeometryPreview";
import {
  PART_PREVIEW_DIALOG_CONTENT_CLASS,
  PreviewStatCell,
  StatValueUnitLeft,
} from "./partPreviewModalShared";

type SortDir = "asc" | "desc";

type PartBreakdownSortKey =
  | "sourceRef"
  | "partName"
  | "qty"
  | "thicknessMm"
  | "materialGrade"
  | "finish"
  | "widthMm"
  | "lengthMm"
  | "areaM2"
  | "lineWeightKg"
  | "preview";

const PP = "quote.partsPhase" as const;
const MOD = "quote.dxfPhase.partPreviewModal" as const;

/** Matches method-phase metrics / sidebar accent. 1.25× former `text-2xl` / `1.65rem` sizes. */
const METRIC_VALUE_ROW =
  "inline-flex flex-wrap items-baseline justify-center gap-x-1 font-semibold tabular-nums text-[#00FF9F] text-[1.875rem] leading-none tracking-tight sm:text-[2.0625rem]";

const METRIC_UNIT_CLASS =
  "font-semibold tabular-nums text-muted-foreground text-[0.72em] leading-none";

/** Matches manual phase preview control accent. */
const PREVIEW_ICON_CLASS = "text-[#00E5FF]";
const PREVIEW_STROKE = "#00E5FF";

/** Horizontal + vertical corner stick; z above other header cells. `top-0` comes from headBase. */
const STICKY_FIRST_HEAD =
  "right-0 z-[50] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.35)]";
const STICKY_FIRST_CELL =
  "sticky right-0 z-20 bg-card shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.25)] group-hover/row:bg-white/[0.04]";

function SummaryMetricCard({
  icon: Icon,
  title,
  valueLine,
}: {
  icon: LucideIcon;
  title: string;
  valueLine: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[8rem] min-w-0 flex-1 flex-col items-center justify-center gap-2 px-3 py-4 text-center sm:min-h-[9.5rem] sm:px-4 sm:py-5">
      <Icon
        className="h-5 w-5 shrink-0 text-muted-foreground/70 sm:h-6 sm:w-6"
        strokeWidth={1.75}
        aria-hidden
      />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className={METRIC_VALUE_ROW}>{valueLine}</div>
    </div>
  );
}

function finishLabel(code: string): string {
  const key = `quote.finishLabels.${code}`;
  const label = t(key);
  return label === key ? code : label;
}

function comparePartRows(
  a: QuotePartRow,
  b: QuotePartRow,
  key: PartBreakdownSortKey,
  dir: SortDir
): number {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  const { grade: ga, finish: fa } = splitMaterialGradeAndFinish(a.material);
  const { grade: gb, finish: fb } = splitMaterialGradeAndFinish(b.material);
  switch (key) {
    case "sourceRef":
      cmp = (a.sourceRef ?? "").localeCompare(b.sourceRef ?? "", undefined, {
        sensitivity: "base",
      });
      break;
    case "partName":
      cmp = a.partName.localeCompare(b.partName, undefined, { sensitivity: "base" });
      break;
    case "qty":
      cmp = a.qty - b.qty;
      break;
    case "thicknessMm":
      cmp = a.thicknessMm - b.thicknessMm;
      break;
    case "materialGrade":
      cmp = ga.localeCompare(gb, undefined, { sensitivity: "base" });
      break;
    case "finish":
      cmp = fa.localeCompare(fb, undefined, { sensitivity: "base" });
      break;
    case "widthMm":
      cmp = a.widthMm - b.widthMm;
      break;
    case "lengthMm":
      cmp = a.lengthMm - b.lengthMm;
      break;
    case "areaM2":
      cmp = a.areaM2 - b.areaM2;
      break;
    case "lineWeightKg":
      cmp = a.weightKg * a.qty - b.weightKg * b.qty;
      break;
    case "preview":
      cmp = a.id.localeCompare(b.id, undefined, { numeric: true });
      break;
  }
  if (cmp !== 0) return cmp * sign;
  return a.id.localeCompare(b.id, undefined, { numeric: true }) * sign;
}

function filterPartRows(
  rows: QuotePartRow[],
  partNameQuery: string,
  refSelected: string[],
  thicknessSelected: string[],
  gradeSelected: string[],
  finishSelected: string[]
): QuotePartRow[] {
  const q = partNameQuery.trim().toLowerCase();
  const refSet = new Set(refSelected);
  const thickSet = new Set(thicknessSelected);
  const gradeSet = new Set(gradeSelected);
  const finishSet = new Set(finishSelected);

  return rows.filter((row) => {
    if (q && !row.partName.toLowerCase().includes(q)) return false;
    if (refSet.size > 0 && !refSet.has((row.sourceRef ?? "").trim())) {
      return false;
    }
    if (thickSet.size > 0 && !thickSet.has(String(row.thicknessMm))) {
      return false;
    }
    const { grade, finish } = splitMaterialGradeAndFinish(row.material);
    if (gradeSet.size > 0 && !gradeSet.has(grade)) return false;
    if (finishSet.size > 0 && !finishSet.has(finish)) return false;
    return true;
  });
}

function deriveFilterOptions(parts: QuotePartRow[]) {
  const refs = new Set<string>();
  const thicknessesMm = new Set<number>();
  const grades = new Set<string>();
  const finishes = new Set<string>();
  for (const row of parts) {
    const r = row.sourceRef?.trim();
    if (r) refs.add(r);
    thicknessesMm.add(row.thicknessMm);
    const { grade, finish } = splitMaterialGradeAndFinish(row.material);
    grades.add(grade);
    finishes.add(finish);
  }
  return {
    refs: [...refs].sort((a, b) => a.localeCompare(b)),
    thicknessesMm: [...thicknessesMm].sort((a, b) => a - b),
    grades: [...grades].sort((a, b) => a.localeCompare(b)),
    finishes: [...finishes].sort((a, b) => a.localeCompare(b)),
  };
}

function columnCount(
  showRef: boolean,
  showDelete: boolean,
  showMaterialPricing: boolean
): number {
  const dim = showMaterialPricing ? 5 : 4;
  return (showRef ? 1 : 0) + 5 + dim + 1 + (showDelete ? 1 : 0);
}

function equalColumnWidthsPct(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(10000 / n) / 100;
  const arr = Array.from({ length: n }, () => base);
  const sum = arr.reduce((a, b) => a + b, 0);
  arr[n - 1] = Math.round((arr[n - 1] + (100 - sum)) * 100) / 100;
  return arr;
}

type MultiSelectOption = { value: string; label: string };

type MultiSelectI18n = {
  all: string;
  choose: string;
  clear: string;
  selectedCount: (n: number) => string;
};

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  disabled,
  i18n,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  i18n: MultiSelectI18n;
}) {
  const summary = useMemo(() => {
    if (selected.length === 0) return i18n.all;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? selected[0];
    }
    return i18n.selectedCount(selected.length);
  }, [selected, options, i18n]);

  return (
    <div className="w-full min-w-[9rem] sm:w-[11rem]">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground text-start">
        {label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            dir="rtl"
            className="h-10 w-full justify-between gap-2 px-3 font-normal"
            disabled={disabled || options.length === 0}
          >
            <span className="min-w-0 flex-1 truncate text-start">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {selected.length > 0 ? i18n.selectedCount(selected.length) : i18n.choose}
          </DropdownMenuLabel>
          {selected.length > 0 ? (
            <>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => {
                  onChange([]);
                }}
              >
                {i18n.clear}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={selected.includes(opt.value)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onChange([...selected, opt.value]);
                } else {
                  onChange(selected.filter((v) => v !== opt.value));
                }
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface PartBreakdownTableProps {
  parts: QuotePartRow[];
  currency: string;
  onDeletePart?: (row: QuotePartRow) => void;
  materialType?: MaterialType;
  materialPricePerKgByRow?: Record<string, string>;
  dxfPartGeometries?: DxfPartGeometry[] | null;
}

export function PartBreakdownTable({
  parts,
  currency,
  onDeletePart,
  materialType,
  materialPricePerKgByRow,
  dxfPartGeometries,
}: PartBreakdownTableProps) {
  const [previewPart, setPreviewPart] = useState<QuotePartRow | null>(null);

  const [partNameSearch, setPartNameSearch] = useState("");
  const [filterRef, setFilterRef] = useState<string[]>([]);
  const [filterThickness, setFilterThickness] = useState<string[]>([]);
  const [filterGrade, setFilterGrade] = useState<string[]>([]);
  const [filterFinish, setFilterFinish] = useState<string[]>([]);

  const filterI18n = useMemo<MultiSelectI18n>(
    () => ({
      all: t(`${PP}.filterAll`),
      choose: t(`${PP}.filterChooseHint`),
      clear: t(`${PP}.filterClear`),
      selectedCount: (n) => t(`${PP}.filterSelectedCount`, { n }),
    }),
    []
  );

  const showRefColumn = useMemo(
    () => parts.some((row) => Boolean(row.sourceRef?.trim())),
    [parts]
  );
  const showDelete = Boolean(onDeletePart);
  const showMaterialPricing = Boolean(materialType && materialPricePerKgByRow);

  const columnWidthsPct = useMemo(
    () => equalColumnWidthsPct(columnCount(showRefColumn, showDelete, showMaterialPricing)),
    [showRefColumn, showDelete, showMaterialPricing]
  );

  const fmtAmount = (n: number) => formatQuickQuoteCurrencyAmount(n, currency);
  const priceHeaderSymbol = quickQuoteCurrencySymbol(currency);

  const filterOptions = useMemo(() => deriveFilterOptions(parts), [parts]);

  const refFilterOptions = useMemo(
    () =>
      filterOptions.refs.map((r) => {
        const sample = parts.find((p) => (p.sourceRef ?? "").trim() === r);
        return {
          value: r,
          label: formatUnifiedSourceLabel(r, sample?.bendTemplateId),
        };
      }),
    [filterOptions.refs, parts]
  );
  const thicknessFilterOptions = useMemo(
    () =>
      filterOptions.thicknessesMm.map((th) => ({
        value: String(th),
        label: formatInteger(Math.round(th)),
      })),
    [filterOptions.thicknessesMm]
  );
  const gradeFilterOptions = useMemo(
    () => filterOptions.grades.map((g) => ({ value: g, label: g })),
    [filterOptions.grades]
  );
  const finishFilterOptions = useMemo(
    () => filterOptions.finishes.map((f) => ({ value: f, label: finishLabel(f) })),
    [filterOptions.finishes]
  );

  const filteredParts = useMemo(
    () =>
      filterPartRows(
        parts,
        partNameSearch,
        filterRef,
        filterThickness,
        filterGrade,
        filterFinish
      ),
    [parts, partNameSearch, filterRef, filterThickness, filterGrade, filterFinish]
  );

  const sortedParts = useMemo(() => {
    const next = [...filteredParts];
    next.sort((a, b) => comparePartRows(a, b, "partName", "asc"));
    return next;
  }, [filteredParts]);

  const breakdownMetrics = useMemo(
    () => jobSummaryFromParts(filteredParts),
    [filteredParts]
  );

  const hasActiveFilters = useMemo(() => {
    return (
      partNameSearch.trim().length > 0 ||
      filterRef.length > 0 ||
      filterThickness.length > 0 ||
      filterGrade.length > 0 ||
      filterFinish.length > 0
    );
  }, [partNameSearch, filterRef, filterThickness, filterGrade, filterFinish]);

  function clearFilters() {
    setPartNameSearch("");
    setFilterRef([]);
    setFilterThickness([]);
    setFilterGrade([]);
    setFilterFinish([]);
  }

  const showRefFilter = filterOptions.refs.length > 0;
  const colSpanEmpty = columnCount(showRefColumn, showDelete, showMaterialPricing);

  const p = previewPart;
  const totalWeightLine = p ? p.weightKg * p.qty : 0;
  const lineAreaM2 = p ? p.areaM2 * p.qty : 0;

  const { finish: previewFinishLabel } = splitMaterialGradeAndFinish(p?.material ?? "");

  const headBase =
    "sticky top-0 z-30 py-2 pe-3 ps-3 text-xs font-medium align-middle whitespace-nowrap bg-card border-e border-white/10";
  const headStart = `${headBase} text-start`;
  const headNum = `${headBase} text-start tabular-nums`;

  const cellBase = "py-2 pe-3 ps-3 align-middle text-sm border-b border-white/[0.06]";
  const cellStart = `${cellBase} text-start`;
  const cellNum = `${cellBase} text-start tabular-nums`;

  return (
    <div className="mt-4 flex w-full min-w-0 flex-col gap-4 sm:mt-5" dir="rtl">
      <div className="overflow-hidden rounded-md border border-white/[0.08] bg-card">
        <div
          className={cn(
            "grid grid-cols-2 items-stretch sm:grid-cols-4",
            /* Mobile 2×2 only: column + row dividers (don’t use odd/e rules on sm — they fight not-last-child) */
            "max-sm:[&>*:nth-child(odd)]:border-e max-sm:[&>*:nth-child(odd)]:border-white/[0.08]",
            "max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(n+3)]:border-white/[0.08]",
            /* sm+: vertical line between every card (all but the last) */
            "sm:[&>*:not(:last-child)]:border-e sm:[&>*:not(:last-child)]:border-white/[0.08]"
          )}
        >
          <SummaryMetricCard
            icon={Layers}
            title={t(`${PP}.cardPlateTypesLabel`)}
            valueLine={<>{formatInteger(breakdownMetrics.uniqueParts)}</>}
          />
          <SummaryMetricCard
            icon={Package}
            title={t(`${PP}.cardPlateQtyLabel`)}
            valueLine={<>{formatInteger(breakdownMetrics.totalQty)}</>}
          />
          <SummaryMetricCard
            icon={LayoutGrid}
            title={t(`${PP}.cardAreaLabel`)}
            valueLine={
              <>
                <span>{formatDecimal(breakdownMetrics.totalPlateAreaM2, 2)}</span>
                <span className={METRIC_UNIT_CLASS}>{t("methodMetrics.unitM2")}</span>
              </>
            }
          />
          <SummaryMetricCard
            icon={Weight}
            title={t(`${PP}.cardWeightLabel`)}
            valueLine={
              <>
                <span>{formatDecimal(breakdownMetrics.totalEstWeightKg, 1)}</span>
                <span className={METRIC_UNIT_CLASS}>{t("methodMetrics.unitKg")}</span>
              </>
            }
          />
        </div>
      </div>

      <div className="rounded-md border border-white/[0.08] bg-card px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-0 flex-1 lg:min-w-[220px] lg:max-w-md">
            <label
              htmlFor="part-breakdown-search"
              className="mb-1.5 block text-xs font-medium text-muted-foreground text-start"
            >
              {t(`${PP}.searchLabel`)}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="part-breakdown-search"
                type="search"
                value={partNameSearch}
                onChange={(e) => setPartNameSearch(e.target.value)}
                placeholder={t(`${PP}.searchPlaceholder`)}
                className="h-10 pe-9"
                autoComplete="off"
                dir="rtl"
              />
            </div>
          </div>

          {showRefFilter ? (
            <MultiSelectFilter
              label={t(`${PP}.filterReference`)}
              options={refFilterOptions}
              selected={filterRef}
              onChange={setFilterRef}
              i18n={filterI18n}
            />
          ) : null}

          <MultiSelectFilter
            label={t(`${PP}.filterThickness`)}
            options={thicknessFilterOptions}
            selected={filterThickness}
            onChange={setFilterThickness}
            disabled={parts.length === 0}
            i18n={filterI18n}
          />

          <MultiSelectFilter
            label={t(`${PP}.filterMaterialGrade`)}
            options={gradeFilterOptions}
            selected={filterGrade}
            onChange={setFilterGrade}
            disabled={parts.length === 0}
            i18n={filterI18n}
          />

          <MultiSelectFilter
            label={t(`${PP}.filterFinish`)}
            options={finishFilterOptions}
            selected={filterFinish}
            onChange={setFilterFinish}
            disabled={parts.length === 0}
            i18n={filterI18n}
          />

          {parts.length > 0 ? (
            <div className="flex w-full shrink-0 lg:w-auto lg:pb-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 gap-2"
                disabled={!hasActiveFilters}
                onClick={clearFilters}
              >
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
                {t(`${PP}.filterReset`)}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-white/[0.08] bg-card">
        <Table
          dir="rtl"
          className={cn(
            "border-separate border-spacing-0",
            showRefColumn && showDelete && (showMaterialPricing ? "min-w-[1300px]" : "min-w-[1180px]"),
            showRefColumn && !showDelete && (showMaterialPricing ? "min-w-[1220px]" : "min-w-[1100px]"),
            !showRefColumn && showDelete && (showMaterialPricing ? "min-w-[1200px]" : "min-w-[1080px]"),
            !showRefColumn && !showDelete && (showMaterialPricing ? "min-w-[1100px]" : "min-w-[980px]")
          )}
          containerClassName="overflow-visible"
        >
          <colgroup>
            {columnWidthsPct.map((pct, i) => (
              <col key={i} style={{ width: `${pct}%` }} />
            ))}
          </colgroup>
          <TableHeader className="relative z-30 border-b border-border bg-card shadow-[0_1px_0_0_hsl(var(--border))] [&_th]:bg-card [&_th:first-child]:rounded-ss-md [&_th:last-child]:rounded-se-md [&_tr]:border-b-0">
            <TableRow className="border-b-0 hover:bg-transparent">
              {showRefColumn ? (
                <TableHead
                  scope="col"
                  className={cn(headStart, "min-w-0", STICKY_FIRST_HEAD)}
                >
                  {t(`${PP}.colReference`)}
                </TableHead>
              ) : null}
              <TableHead
                scope="col"
                className={cn(headStart, "min-w-0", !showRefColumn && STICKY_FIRST_HEAD)}
              >
                {t(`${PP}.colPartNumber`)}
              </TableHead>
              <TableHead scope="col" className={headNum}>
                {t(`${PP}.colQuantity`)}
              </TableHead>
              <TableHead scope="col" className={headNum}>
                {t(`${PP}.colThickness`)}
              </TableHead>
              <TableHead scope="col" className={headNum}>
                {t(`${PP}.colLength`)}
              </TableHead>
              <TableHead scope="col" className={headNum}>
                {t(`${PP}.colWidth`)}
              </TableHead>
              <TableHead scope="col" className={headNum}>
                {t(`${PP}.colArea`)}
              </TableHead>
              <TableHead scope="col" className={headNum}>
                {t(`${PP}.colWeight`)}
              </TableHead>
              <TableHead scope="col" className={cn(headStart, "min-w-0")}>
                {t(`${PP}.colMaterialGrade`)}
              </TableHead>
              <TableHead scope="col" className={headStart}>
                {t(`${PP}.colFinish`)}
              </TableHead>
              {showMaterialPricing ? (
                <TableHead
                  scope="col"
                  className={cn(headNum)}
                  title={t(`${PP}.materialPriceTooltip`)}
                >
                  {t(`${PP}.colMaterialPrice`, { symbol: priceHeaderSymbol })}
                </TableHead>
              ) : null}
              <TableHead
                scope="col"
                className={cn(headBase, "min-w-[4.5rem] text-center", !showDelete && "border-e-0")}
              >
                {t(`${PP}.colPreview`)}
              </TableHead>
              {showDelete ? (
                <TableHead scope="col" className={cn(headBase, "w-[1%] border-e-0 text-center")}>
                  <span className="sr-only">{t(`${PP}.colDelete`)}</span>
                  <span aria-hidden className="text-muted-foreground">
                    {t(`${PP}.colDelete`)}
                  </span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedParts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpanEmpty}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {parts.length === 0
                    ? t(`${PP}.emptyNoParts`)
                    : t(`${PP}.emptyNoFilterMatch`)}
                </TableCell>
              </TableRow>
            ) : null}
            {sortedParts.map((row) => {
              const lineWeightKg = row.weightKg * row.qty;
              const { grade, finish } = splitMaterialGradeAndFinish(row.material);
              return (
                <TableRow key={row.id} className="group/row hover:bg-white/[0.03]">
                  {showRefColumn ? (
                    <TableCell
                      className={cn(
                        cellStart,
                        "text-xs font-medium min-w-0 border-e border-white/10",
                        STICKY_FIRST_CELL
                      )}
                    >
                      <span className="truncate block" title={formatUnifiedSourceForRow(row)}>
                        {formatUnifiedSourceForRow(row)}
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell
                    className={cn(
                      cellStart,
                      "font-medium min-w-0 border-e border-white/10",
                      !showRefColumn && STICKY_FIRST_CELL
                    )}
                  >
                    <span className="truncate block" title={row.partName}>
                      {row.partName}
                    </span>
                  </TableCell>
                  <TableCell className={cn(cellNum, "text-xs border-e border-white/10")}>
                    {row.qty}
                  </TableCell>
                  <TableCell className={cn(cellNum, "text-xs border-e border-white/10")}>
                    {formatInteger(Math.round(row.thicknessMm))}
                  </TableCell>
                  <TableCell className={cn(cellNum, "text-xs border-e border-white/10")}>
                    {formatDecimal(row.lengthMm, 2)}
                  </TableCell>
                  <TableCell className={cn(cellNum, "text-xs border-e border-white/10")}>
                    {formatDecimal(row.widthMm, 2)}
                  </TableCell>
                  <TableCell className={cn(cellNum, "text-xs border-e border-white/10")}>
                    {formatDecimal(row.areaM2, 3)}
                  </TableCell>
                  <TableCell className={cn(cellNum, "text-xs border-e border-white/10")}>
                    {formatDecimal(lineWeightKg, 2)}
                  </TableCell>
                  <TableCell className={cn(cellStart, "text-xs min-w-0 border-e border-white/10")}>
                    <span className="truncate block" title={grade}>
                      {grade}
                    </span>
                  </TableCell>
                  <TableCell className={cn(cellStart, "text-xs min-w-0 border-e border-white/10")}>
                    <span className="truncate block" title={finishLabel(finish)}>
                      {finishLabel(finish)}
                    </span>
                  </TableCell>
                  {showMaterialPricing && materialType && materialPricePerKgByRow ? (
                    <TableCell
                      className={cn(
                        cellNum,
                        "text-xs font-medium text-foreground border-e border-white/10"
                      )}
                    >
                      {fmtAmount(
                        lineWeightKg *
                          parseMaterialPricePerKg(
                            materialPricePerKgByRow[materialPricingRowKey(row, materialType)] ?? ""
                          )
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell
                    className={cn(
                      cellBase,
                      "text-center border-e border-white/10",
                      !showDelete && "border-e-0"
                    )}
                  >
                    <button
                      type="button"
                      aria-label={t(`${PP}.ariaPreviewRow`, { name: row.partName })}
                      onClick={() => setPreviewPart(row)}
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        PREVIEW_ICON_CLASS,
                        "hover:bg-white/5",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      )}
                    >
                      <Eye className="h-4 w-4" stroke={PREVIEW_STROKE} strokeWidth={2} aria-hidden />
                    </button>
                  </TableCell>
                  {showDelete ? (
                    <TableCell className={cn(cellBase, "text-center border-e-0")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={t(`${PP}.ariaDeleteRow`, { name: row.partName })}
                        onClick={() => onDeletePart?.(row)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={previewPart !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewPart(null);
        }}
      >
        <DialogContent showCloseButton={false} className={cn(PART_PREVIEW_DIALOG_CONTENT_CLASS)}>
          {p ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" dir="rtl">
              <DialogTitle className="sr-only">{p.partName}</DialogTitle>
              <DialogDescription className="sr-only">{t(`${MOD}.a11yTitle`)}</DialogDescription>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className="flex min-h-[min(45vh,475px)] flex-1 shrink-0 items-center justify-center px-5 py-6"
                  dir="ltr"
                >
                  <div className="relative flex h-[min(425px,52vh)] w-full min-w-0 max-w-full items-center justify-center overflow-hidden bg-transparent">
                    <QuotePartGeometryPreview
                      part={p}
                      dxfGeometries={dxfPartGeometries}
                      rectangleAppearance="dxfPreviewModal"
                      className="min-h-0 w-full max-w-full border-0 bg-transparent shadow-none [&>div]:min-h-0 [&>div]:bg-transparent [&_svg]:max-h-[min(400px,48vh)]"
                    />
                  </div>
                </div>

                <div className="w-full shrink-0 border-t border-white/10">
                  <div dir="ltr" className="w-full overflow-hidden">
                    <div className="grid w-full grid-cols-4 grid-rows-2">
                      {(
                        [
                          {
                            key: "finish",
                            icon: Palette,
                            label: t(`${MOD}.finish`),
                            value: finishLabel(previewFinishLabel),
                          },
                          {
                            key: "thickness",
                            icon: Layers,
                            label: t(`${MOD}.thickness`),
                            value: (
                              <StatValueUnitLeft
                                numericText={formatDecimal(Number(p.thicknessMm) || 0, 1)}
                                unitSuffix={t(`${MOD}.mmSuffix`)}
                              />
                            ),
                          },
                          {
                            key: "quantity",
                            icon: Hash,
                            label: t(`${MOD}.quantity`),
                            value: Math.max(0, Math.floor(p.qty)),
                          },
                          {
                            key: "plateName",
                            icon: Tag,
                            label: t(`${MOD}.plateName`),
                            value: p.partName,
                          },
                          {
                            key: "weight",
                            icon: Weight,
                            label: t(`${MOD}.weight`),
                            value:
                              totalWeightLine > 0 ? (
                                <StatValueUnitLeft
                                  numericText={formatDecimal(totalWeightLine, 2)}
                                  unitSuffix={t(`${MOD}.kgSuffix`)}
                                />
                              ) : (
                                "-"
                              ),
                          },
                          {
                            key: "area",
                            icon: Square,
                            label: t(`${MOD}.area`),
                            value:
                              lineAreaM2 > 0 ? (
                                <StatValueUnitLeft
                                  numericText={formatDecimal(lineAreaM2, 4)}
                                  unitSuffix={t(`${MOD}.m2Suffix`)}
                                />
                              ) : (
                                "-"
                              ),
                          },
                          {
                            key: "length",
                            icon: MoveHorizontal,
                            label: t(`${MOD}.length`),
                            value: (
                              <StatValueUnitLeft
                                numericText={formatDecimal(p.lengthMm, 1)}
                                unitSuffix={t(`${MOD}.mmSuffix`)}
                              />
                            ),
                          },
                          {
                            key: "width",
                            icon: MoveVertical,
                            label: t(`${MOD}.width`),
                            value: (
                              <StatValueUnitLeft
                                numericText={formatDecimal(p.widthMm, 1)}
                                unitSuffix={t(`${MOD}.mmSuffix`)}
                              />
                            ),
                          },
                        ] as const
                      ).map((cell, i) => (
                        <PreviewStatCell
                          key={cell.key}
                          icon={cell.icon}
                          label={cell.label}
                          value={cell.value}
                          className={cn(
                            "border-b border-solid border-[#00FF9F]/20",
                            i % 4 === 0 && "border-s",
                            i % 4 !== 3 && "border-e"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
