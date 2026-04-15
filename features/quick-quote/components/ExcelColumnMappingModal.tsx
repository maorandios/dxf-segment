"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { AlertCircle, FileSpreadsheet, RefreshCw, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readExcelHeaders, parseExcelFileWithMapping } from "@/lib/parsers/excelParser";
import type { ColumnMapping, ExcelRow } from "@/types";
import type { ExcelHeadersResult } from "@/lib/parsers/excelParser";
import { t } from "@/lib/i18n";

const NONE = "__none__";

interface MappingField {
  key: keyof Omit<ColumnMapping, "headerRowIdx">;
  required: boolean;
}

/** Same fields as {@link ExcelUploadStep} variant `dxf`. */
const MAPPING_FIELDS: MappingField[] = [
  { key: "partNameCol", required: true },
  { key: "qtyCol", required: false },
  { key: "thkCol", required: false },
  { key: "matCol", required: false },
  { key: "lengthCol", required: false },
  { key: "widthCol", required: false },
  { key: "weightCol", required: false },
];

const MAPPING_COL_WIDTH_PCT = 100 / MAPPING_FIELDS.length;

function fieldLabelKey(fieldKey: MappingField["key"]): string {
  return `quote.excelColumnMapping.fields.${fieldKey}.label`;
}

function fieldDescriptionKey(fieldKey: MappingField["key"]): string {
  return `quote.excelColumnMapping.fields.${fieldKey}.description`;
}

export interface ExcelColumnMappingModalProps {
  open: boolean;
  file: File | null;
  arrayBuffer: ArrayBuffer | null;
  /** Called after mapping is valid and parsing produced at least one row. */
  onComplete: (rows: ExcelRow[]) => void;
  /** User discarded mapping — clear spreadsheet from the parent step. */
  onDiscard: () => void;
}

export function ExcelColumnMappingModal({
  open,
  file,
  arrayBuffer,
  onComplete,
  onDiscard,
}: ExcelColumnMappingModalProps) {
  const [headersResult, setHeadersResult] = useState<ExcelHeadersResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open || !arrayBuffer) {
      if (!open) {
        setHeadersResult(null);
        setMapping(null);
        setParseError(null);
      }
      return;
    }
    try {
      const headers = readExcelHeaders(arrayBuffer);
      setHeadersResult(headers);
      setMapping(headers.autoDetected);
      setParseError(null);
    } catch {
      setHeadersResult(null);
      setMapping(null);
      setParseError(t("quote.excelColumnMapping.headersReadError"));
    }
  }, [open, arrayBuffer]);

  const updateMapping = useCallback(
    (field: MappingField["key"], value: string) => {
      if (!mapping) return;
      setMapping({
        ...mapping,
        [field]: value === NONE ? null : parseInt(value, 10),
      });
      setParseError(null);
    },
    [mapping]
  );

  const resetToAutoDetected = useCallback(() => {
    if (headersResult) {
      setMapping(headersResult.autoDetected);
      setParseError(null);
    }
  }, [headersResult]);

  const isMappingValid = useMemo(() => {
    if (!mapping) return false;
    return mapping.partNameCol !== null;
  }, [mapping]);

  const previewData = useMemo(() => {
    if (!headersResult || !mapping) return null;

    return headersResult.previewRows.slice(0, 3).map((row, rowIndex) => {
      const cells: { label: string; value: string }[] = [];

      MAPPING_FIELDS.forEach((field) => {
        const colIdx = mapping[field.key];
        const value =
          colIdx !== null && colIdx !== undefined
            ? String(row[colIdx] ?? "-")
            : "-";
        cells.push({ label: t(fieldLabelKey(field.key)), value });
      });

      return { rowIndex, cells };
    });
  }, [headersResult, mapping]);

  const handleComplete = useCallback(async () => {
    if (!arrayBuffer || !mapping || !file) return;
    if (!isMappingValid) {
      setParseError(t("quote.excelColumnMapping.mapPartNameBeforeComplete"));
      return;
    }

    setParseError(null);
    try {
      const result = await parseExcelFileWithMapping(
        arrayBuffer,
        mapping,
        "temp-file-id",
        "temp-client-id",
        "temp-batch-id"
      );

      if (result.rows.length === 0) {
        setParseError(t("quote.excelColumnMapping.noValidRows"));
        return;
      }

      const rowsWithIds: ExcelRow[] = result.rows.map((row, index) => ({
        ...row,
        id: `excel-row-${index}`,
      }));

      onComplete(rowsWithIds);
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : t("quote.excelColumnMapping.parseFailed")
      );
    }
  }, [arrayBuffer, mapping, file, isMappingValid, onComplete]);

  const runDiscard = useCallback(() => {
    setDiscardConfirmOpen(false);
    onDiscard();
  }, [onDiscard]);

  const requestDiscard = useCallback(() => {
    setDiscardConfirmOpen(true);
  }, []);

  const handleMainDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        requestDiscard();
      }
    },
    [requestDiscard]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleMainDialogOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="w-[min(calc(100vw-2rem),112rem)] max-w-[min(calc(100vw-2rem),112rem)] max-h-[min(92vh,960px)] flex flex-col gap-0 p-0"
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2 border-b text-start sm:text-start">
            <DialogTitle>{t("quote.excelColumnMapping.title")}</DialogTitle>
            <DialogDescription>
              {t("quote.excelColumnMapping.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {file && headersResult && mapping && (
              <>
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">{t("quote.excelColumnMapping.file")}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("quote.excelColumnMapping.rowsDetected", {
                            n: headersResult.previewRows.length,
                          })}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {headersResult.sheetName}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="min-w-0">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {t("quote.excelColumnMapping.mappingSectionTitle")}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t("quote.excelColumnMapping.mappingSectionHint")}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetToAutoDetected}
                        className="gap-2 shrink-0"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t("quote.excelColumnMapping.resetAuto")}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="min-w-0 space-y-4">
                    {previewData && (
                      <div className="min-w-0 space-y-2">
                        <div className="min-w-0 overflow-x-hidden rounded-md border px-2 sm:px-3">
                          <Table
                            containerClassName="overflow-visible"
                            className="w-full max-w-full table-fixed border-collapse text-sm"
                          >
                            <colgroup>
                              {MAPPING_FIELDS.map((field) => (
                                <col
                                  key={field.key}
                                  style={{ width: `${MAPPING_COL_WIDTH_PCT}%` }}
                                />
                              ))}
                            </colgroup>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                {MAPPING_FIELDS.map((field) => {
                                  const currentValue = mapping[field.key];
                                  const valueStr =
                                    currentValue !== null && currentValue !== undefined
                                      ? String(currentValue)
                                      : NONE;

                                  return (
                                    <TableHead
                                      key={field.key}
                                      className="!h-auto min-w-0 !px-2.5 !pt-[1.953125rem] !pb-[2.734375rem] align-top sm:!px-3 sm:!pt-[2.34375rem] sm:!pb-[3.125rem]"
                                    >
                                      <div className="min-w-0 space-y-[0.9765625rem]">
                                        <div className="flex min-w-0 items-baseline gap-1 pt-1">
                                          <span className="break-words text-sm font-semibold leading-snug">
                                            {t(fieldLabelKey(field.key))}
                                          </span>
                                          {field.required && (
                                            <span className="shrink-0 text-destructive text-sm">
                                              *
                                            </span>
                                          )}
                                        </div>
                                        <Select
                                          value={valueStr}
                                          onValueChange={(v) => updateMapping(field.key, v)}
                                        >
                                          <SelectTrigger className="h-8 w-full min-w-0 max-w-full px-2 text-sm [&>span]:min-w-0 [&>span]:truncate">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value={NONE}>
                                              <span className="text-muted-foreground text-xs">
                                                {t("quote.excelColumnMapping.none")}
                                              </span>
                                            </SelectItem>
                                            {headersResult.rawHeaders
                                              .filter((h) => h && h.trim())
                                              .map((header, index) => (
                                                <SelectItem
                                                  key={`${header}-${index}`}
                                                  value={String(index)}
                                                >
                                                  <span className="text-xs">{header}</span>
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground leading-relaxed break-words pt-[0.5859375rem] pb-[0.390625rem]">
                                          {t(fieldDescriptionKey(field.key))}
                                        </p>
                                      </div>
                                    </TableHead>
                                  );
                                })}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewData.map((row) => (
                                <TableRow key={row.rowIndex}>
                                  {row.cells.map((cell, cellIndex) => (
                                    <TableCell
                                      key={cellIndex}
                                      className="overflow-hidden !px-1 !py-2 align-middle text-sm tabular-nums leading-normal"
                                    >
                                      <span
                                        className="block min-w-0 whitespace-nowrap"
                                        title={cell.value}
                                      >
                                        {cell.value}
                                      </span>
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("quote.excelColumnMapping.previewRows")}
                        </p>
                      </div>
                    )}

                    {!isMappingValid && (
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <p className="text-sm">{t("quote.excelColumnMapping.partNameRequired")}</p>
                      </div>
                    )}

                    {parseError && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <p className="text-sm text-destructive">{parseError}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {!file || !headersResult || !mapping ? (
              <p className="text-sm text-muted-foreground">{t("quote.excelColumnMapping.loading")}</p>
            ) : null}
          </div>

          <DialogFooter
            dir="ltr"
            className="shrink-0 w-full px-6 py-4 border-t border-white/[0.08] bg-card/40 flex flex-row flex-wrap justify-start gap-2 sm:flex-row sm:justify-start sm:space-x-0"
          >
            <Button
              type="button"
              onClick={() => void handleComplete()}
              disabled={!isMappingValid || !mapping || !arrayBuffer}
            >
              {t("quote.excelColumnMapping.complete")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 inline-flex flex-row"
              onClick={requestDiscard}
            >
              {t("common.back")}
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md z-[100]">
          <DialogHeader className="text-start sm:text-start">
            <DialogTitle>{t("quote.excelColumnMapping.discardTitle")}</DialogTitle>
            <DialogDescription>
              {t("quote.excelColumnMapping.discardDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            dir="ltr"
            className="w-full gap-2 flex flex-row flex-wrap justify-start sm:justify-start sm:space-x-0"
          >
            <Button type="button" variant="outline" onClick={() => setDiscardConfirmOpen(false)}>
              {t("quote.excelColumnMapping.discardCancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={runDiscard}>
              {t("quote.excelColumnMapping.discardConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
