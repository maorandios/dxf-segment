"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  formatAreaM2,
  formatDxfDims,
  formatWeightKg,
} from "./commercialCalculations";
import { EditableCommercialCell } from "./EditableCommercialCell";
import {
  issueMessageHe,
  primaryActionLabelHe,
  REVIEW_STATUS_HE,
} from "./issueMessages";
import { SimpleDxfThumbnail } from "./SimpleDxfThumbnail";
import { FIXED_TABLE_COLUMN_HEADERS } from "./tableContract";
import type { FinalIntakeRow, FinalIssueCode } from "./types";

function StatusBadge({ status }: { status: FinalIntakeRow["status"] }) {
  const variant =
    status === "READY"
      ? "default"
      : status === "NEEDS_REVIEW"
        ? "secondary"
        : status === "BLOCKED"
          ? "destructive"
          : "outline";
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      <span className="sr-only">סטטוס: </span>
      {REVIEW_STATUS_HE[status]}
      {status === "READY" && (
        <span className="ms-1" aria-hidden>
          ✓
        </span>
      )}
      {status === "BLOCKED" && (
        <span className="ms-1" aria-hidden>
          !
        </span>
      )}
    </Badge>
  );
}

function PartCell({ row }: { row: FinalIntakeRow }) {
  const showDxfProvenance = row.part.displayNameSource === "MATCHED_DXF";
  const showProfile =
    row.part.sourceProfile != null &&
    row.part.sourceProfile !== row.part.displayName;
  const showFilename =
    row.part.matchedDxfFilename != null &&
    row.part.matchedDxfFilename !== row.part.displayName &&
    !showDxfProvenance;
  const showSourceLength =
    !row.preview.geometryAvailable &&
    row.source.sourceLengthMm != null &&
    row.source.sourceLengthMm > 0;

  return (
    <div>
      <div className="font-medium">{row.part.displayName}</div>
      {showDxfProvenance && (
        <div className="text-xs text-muted-foreground">DXF משויך</div>
      )}
      {showFilename && (
        <div className="text-xs text-muted-foreground">
          {row.part.matchedDxfFilename}
        </div>
      )}
      {showProfile && (
        <div className="text-xs text-muted-foreground">
          {row.part.sourceProfile}
        </div>
      )}
      {showSourceLength && (
        <div className="text-xs text-muted-foreground">
          אורך מקור: {row.source.sourceLengthMm} מ״מ
        </div>
      )}
    </div>
  );
}

function IssueCell({
  row,
  noDxfFilesUploaded,
  onAction,
}: {
  row: FinalIntakeRow;
  noDxfFilesUploaded: boolean;
  onAction: (label: string) => void;
}) {
  if (row.status === "READY") {
    return (
      <span className="text-xs text-muted-foreground">מוכן לתמחור</span>
    );
  }
  if (row.status === "EXCLUDED") {
    return <span className="text-xs text-muted-foreground">הוחרג</span>;
  }
  const codes = row.issueCodes;
  const shown = codes.slice(0, 2);
  const extra = codes.length - shown.length;
  const action = primaryActionLabelHe(codes);
  return (
    <div className="max-w-[14rem] space-y-1">
      {shown.map((code) => (
        <p key={code} className="text-xs leading-snug">
          {issueMessageHe(code as FinalIssueCode, {
            sourceWidthMm: row.source.sourceWidthMm,
            sourceLengthMm: row.source.sourceLengthMm,
            noDxfFilesUploaded,
          })}
        </p>
      ))}
      {extra > 0 && (
        <p className="text-xs text-muted-foreground">ועוד {extra} בעיות</p>
      )}
      {action && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-1 h-7"
          onClick={() => onAction(action)}
        >
          {action}
        </Button>
      )}
    </div>
  );
}

export function SimpleFinalItemsTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenDetails,
  onEditField,
  onRowAction,
  noDxfFilesUploaded,
}: {
  rows: FinalIntakeRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onOpenDetails: (id: string) => void;
  onEditField: (
    id: string,
    field: "material" | "thicknessMm" | "quantity",
    value: string | number | null
  ) => void;
  onRowAction: (id: string, action: string) => void;
  noDxfFilesUploaded: boolean;
}) {
  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  return (
    <div className="hidden overflow-x-auto md:block" dir="rtl">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="px-2 py-2 text-right font-medium">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() =>
                  onToggleSelectAll(rows.map((r) => r.id))
                }
                aria-label="בחר הכל"
              />
            </th>
            {FIXED_TABLE_COLUMN_HEADERS.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-2 py-2 text-right font-medium"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/60 align-top hover:bg-muted/20"
            >
              <td className="px-2 py-2">
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={() => onToggleSelect(row.id)}
                  aria-label={`בחר ${row.part.displayName}`}
                />
              </td>
              <td className="px-2 py-2">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-2 py-2">
                <button
                  type="button"
                  className="text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onOpenDetails(row.id)}
                >
                  <PartCell row={row} />
                </button>
              </td>
              <td className="px-2 py-2">
                <SimpleDxfThumbnail
                  widthMm={row.dxfDimensions.widthMm}
                  lengthMm={row.dxfDimensions.lengthMm}
                />
              </td>
              <td className="px-2 py-2">
                <EditableCommercialCell
                  field="material"
                  value={row.material}
                  onCommit={(v, err) => {
                    if (!err) onEditField(row.id, "material", v);
                  }}
                />
              </td>
              <td className="px-2 py-2">
                <EditableCommercialCell
                  field="thicknessMm"
                  value={row.thicknessMm}
                  onCommit={(v, err) => {
                    if (!err) onEditField(row.id, "thicknessMm", v);
                  }}
                />
              </td>
              <td className="px-2 py-2">
                <EditableCommercialCell
                  field="quantity"
                  value={row.quantity}
                  onCommit={(v, err) => {
                    if (!err) onEditField(row.id, "quantity", v);
                  }}
                />
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                {formatDxfDims(
                  row.dxfDimensions.widthMm,
                  row.dxfDimensions.lengthMm
                )}
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                {formatAreaM2(row.commercial.areaM2)}
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                {formatWeightKg(row.commercial.unitWeightKg)}
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                {formatWeightKg(row.commercial.totalWeightKg)}
              </td>
              <td className="px-2 py-2">
                <IssueCell
                  row={row}
                  noDxfFilesUploaded={noDxfFilesUploaded}
                  onAction={(label) => onRowAction(row.id, label)}
                />
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 justify-start px-2"
                    onClick={() => onOpenDetails(row.id)}
                    aria-label={`צפה בפרטים עבור ${row.part.displayName}`}
                  >
                    צפה בפרטים
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 justify-start px-2"
                    onClick={() => onRowAction(row.id, "בחר DXF")}
                    aria-label={`שנה DXF עבור ${row.part.displayName}`}
                  >
                    שנה DXF
                  </Button>
                  {row.isExcluded ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 justify-start px-2"
                      onClick={() => onRowAction(row.id, "החזר להצעה")}
                    >
                      החזר להצעה
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 justify-start px-2"
                      onClick={() => onRowAction(row.id, "החרג מהצעה")}
                    >
                      החרג מהצעה
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SimpleFinalItemCards({
  rows,
  onOpenDetails,
  onEditField,
  onRowAction,
  noDxfFilesUploaded,
}: {
  rows: FinalIntakeRow[];
  onOpenDetails: (id: string) => void;
  onEditField: (
    id: string,
    field: "material" | "thicknessMm" | "quantity",
    value: string | number | null
  ) => void;
  onRowAction: (id: string, action: string) => void;
  noDxfFilesUploaded: boolean;
}) {
  return (
    <ul className="space-y-3 md:hidden" dir="rtl">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-lg border border-border bg-card p-3 shadow-sm"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenDetails(row.id)}
            >
              <PartCell row={row} />
            </button>
            <StatusBadge status={row.status} />
          </div>
          <div className="mb-2 flex gap-3">
            <SimpleDxfThumbnail
              widthMm={row.dxfDimensions.widthMm}
              lengthMm={row.dxfDimensions.lengthMm}
            />
            <div className="grid flex-1 grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">חומר</div>
                <EditableCommercialCell
                  field="material"
                  value={row.material}
                  onCommit={(v, err) => {
                    if (!err) onEditField(row.id, "material", v);
                  }}
                />
              </div>
              <div>
                <div className="text-muted-foreground">עובי</div>
                <EditableCommercialCell
                  field="thicknessMm"
                  value={row.thicknessMm}
                  onCommit={(v, err) => {
                    if (!err) onEditField(row.id, "thicknessMm", v);
                  }}
                />
              </div>
              <div>
                <div className="text-muted-foreground">כמות</div>
                <EditableCommercialCell
                  field="quantity"
                  value={row.quantity}
                  onCommit={(v, err) => {
                    if (!err) onEditField(row.id, "quantity", v);
                  }}
                />
              </div>
              <div>
                <div className="text-muted-foreground">מידות DXF</div>
                <div>
                  {formatDxfDims(
                    row.dxfDimensions.widthMm,
                    row.dxfDimensions.lengthMm
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">שטח מסחרי</div>
                <div>{formatAreaM2(row.commercial.areaM2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">משקל ליחידה</div>
                <div>{formatWeightKg(row.commercial.unitWeightKg)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">משקל כולל</div>
                <div>{formatWeightKg(row.commercial.totalWeightKg)}</div>
              </div>
            </div>
          </div>
          <IssueCell
            row={row}
            noDxfFilesUploaded={noDxfFilesUploaded}
            onAction={(label) => onRowAction(row.id, label)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenDetails(row.id)}
            >
              צפה בפרטים
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRowAction(row.id, "בחר DXF")}
            >
              שנה DXF
            </Button>
            {row.isExcluded ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRowAction(row.id, "החזר להצעה")}
              >
                החזר להצעה
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRowAction(row.id, "החרג מהצעה")}
              >
                החרג מהצעה
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
