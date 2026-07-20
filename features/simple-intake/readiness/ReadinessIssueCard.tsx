"use client";

import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDxfDims } from "../results/commercialCalculations";
import type { FinalIntakeRow, FinalIssueCode } from "../results/types";
import {
  presentationForCode,
  secondaryActionLabel,
  type ReadinessIssueAction,
} from "./issuePresentation";
import { orderedCriticalCodes } from "./pickPrimaryIssue";

export type IssueCardHandlers = {
  onSaveQuantity: (rowId: string, value: number) => void;
  onSaveMaterial: (rowId: string, value: string) => void;
  onSaveThickness: (rowId: string, value: number) => void;
  onSaveDimensions: (rowId: string, widthMm: number, lengthMm: number) => void;
  onSelectDxf: (rowId: string) => void;
  onCompareDxf: (rowId: string) => void;
  onUploadDxfs: (files: FileList) => void;
  onExclude: (rowId: string) => void;
  onDefer: (rowId: string, issue: FinalIssueCode) => void;
  onRestore?: (rowId: string, issue: FinalIssueCode) => void;
};

function relevantDetails(row: FinalIntakeRow, issue: FinalIssueCode): string {
  const parts: string[] = [];
  const dims = formatDxfDims(
    row.source.sourceWidthMm,
    row.source.sourceLengthMm
  );
  if (dims !== "—") parts.push(dims);
  if (issue !== "MISSING_QUANTITY" && row.quantity != null) {
    parts.push(`כמות ${row.quantity}`);
  }
  if (issue !== "MISSING_THICKNESS" && row.thicknessMm != null) {
    parts.push(`עובי ${row.thicknessMm} מ״מ`);
  }
  return parts.join(" · ");
}

export function ReadinessIssueCard({
  row,
  issue,
  mode = "active",
  handlers,
}: {
  row: FinalIntakeRow;
  issue: FinalIssueCode;
  mode?: "active" | "deferred";
  handlers: IssueCardHandlers;
}) {
  const presentation = presentationForCode(issue);
  const fileRef = useRef<HTMLInputElement>(null);
  const multiCount = orderedCriticalCodes(row).length;

  if (!presentation) return null;

  const menuActions: ReadinessIssueAction[] = [
    ...presentation.secondaryActions,
    ...(presentation.allowExclude
      ? (["EXCLUDE"] as ReadinessIssueAction[])
      : []),
  ];

  function runPrimary(): void {
    const a = presentation!.primaryAction;
    if (a === "SELECT_DXF") handlers.onSelectDxf(row.id);
    else if (a === "COMPARE_DXF") handlers.onCompareDxf(row.id);
    else if (a === "REPLACE_DXF") fileRef.current?.click();
  }

  return (
    <li className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="min-w-0">
        <div className="truncate font-medium">{row.part.displayName}</div>
        <div className="text-xs text-muted-foreground">
          {relevantDetails(row, issue)}
        </div>
        {multiCount > 1 && mode === "active" && (
          <p className="mt-1 text-xs text-muted-foreground">
            נמצאו {multiCount} דברים שצריך להשלים
          </p>
        )}
      </div>

      <div>
        <div className="text-sm font-medium">{presentation.title}</div>
        <p className="text-sm text-muted-foreground">
          {presentation.explanation}
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".dxf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handlers.onUploadDxfs(e.target.files);
          e.target.value = "";
        }}
      />

      {mode === "active" && presentation.primaryAction === "EDIT_QUANTITY" && (
        <QuantityEditor
          fieldId={`qi-qty-${row.id}`}
          primaryLabel={presentation.primaryLabel}
          onSave={(n) => handlers.onSaveQuantity(row.id, n)}
        />
      )}
      {mode === "active" && presentation.primaryAction === "EDIT_MATERIAL" && (
        <MaterialEditor
          fieldId={`qi-mat-${row.id}`}
          primaryLabel={presentation.primaryLabel}
          onSave={(v) => handlers.onSaveMaterial(row.id, v)}
        />
      )}
      {mode === "active" && presentation.primaryAction === "EDIT_THICKNESS" && (
        <ThicknessEditor
          fieldId={`qi-thk-${row.id}`}
          primaryLabel={presentation.primaryLabel}
          onSave={(n) => handlers.onSaveThickness(row.id, n)}
        />
      )}
      {mode === "active" &&
        presentation.primaryAction === "EDIT_DIMENSIONS" && (
          <DimensionsEditor
            fieldIdPrefix={`qi-dim-${row.id}`}
            primaryLabel={presentation.primaryLabel}
            onSave={(w, l) => handlers.onSaveDimensions(row.id, w, l)}
          />
        )}

      {mode === "active" && (
        <div className="flex flex-wrap items-center gap-2">
          {(presentation.primaryAction === "SELECT_DXF" ||
            presentation.primaryAction === "COMPARE_DXF" ||
            presentation.primaryAction === "REPLACE_DXF") && (
            <Button type="button" size="sm" onClick={runPrimary}>
              {presentation.primaryLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handlers.onDefer(row.id, issue)}
          >
            טפל אחר כך
          </Button>
          {menuActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="פעולות נוספות"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {menuActions.map((a) => (
                  <DropdownMenuItem
                    key={a}
                    onSelect={() => {
                      if (a === "EXCLUDE") handlers.onExclude(row.id);
                      else if (a === "UPLOAD_DXF" || a === "REPLACE_DXF") {
                        fileRef.current?.click();
                      } else if (a === "SELECT_DXF") {
                        handlers.onSelectDxf(row.id);
                      } else if (a === "COMPARE_DXF") {
                        handlers.onCompareDxf(row.id);
                      }
                    }}
                  >
                    {a === "EXCLUDE"
                      ? "החרג מההצעה"
                      : secondaryActionLabel(a)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {mode === "deferred" && handlers.onRestore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlers.onRestore?.(row.id, issue)}
        >
          החזר לטיפול
        </Button>
      )}
    </li>
  );
}

function QuantityEditor({
  fieldId,
  primaryLabel,
  onSave,
}: {
  fieldId: string;
  primaryLabel: string;
  onSave: (n: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={fieldId}>כמות</Label>
        <Input
          id={fieldId}
          value={draft}
          inputMode="numeric"
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
        size="sm"
        onClick={() => {
          const n = Number(draft);
          if (!Number.isInteger(n) || !(n > 0)) {
            setError("יש להזין מספר יחידות גדול מאפס.");
            return;
          }
          onSave(n);
        }}
      >
        {primaryLabel}
      </Button>
    </div>
  );
}

function MaterialEditor({
  fieldId,
  primaryLabel,
  onSave,
}: {
  fieldId: string;
  primaryLabel: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={fieldId}>חומר</Label>
        <Input
          id={fieldId}
          value={draft}
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
        size="sm"
        onClick={() => {
          const t = draft.trim();
          if (!t) {
            setError("יש להזין סוג חומר.");
            return;
          }
          onSave(t);
        }}
      >
        {primaryLabel}
      </Button>
    </div>
  );
}

function ThicknessEditor({
  fieldId,
  primaryLabel,
  onSave,
}: {
  fieldId: string;
  primaryLabel: string;
  onSave: (n: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={fieldId}>עובי במ״מ</Label>
        <Input
          id={fieldId}
          value={draft}
          inputMode="decimal"
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
        size="sm"
        onClick={() => {
          const n = Number(String(draft).replace(",", "."));
          if (!Number.isFinite(n) || !(n > 0)) {
            setError("יש להזין עובי גדול מאפס.");
            return;
          }
          onSave(n);
        }}
      >
        {primaryLabel}
      </Button>
    </div>
  );
}

function DimensionsEditor({
  fieldIdPrefix,
  primaryLabel,
  onSave,
}: {
  fieldIdPrefix: string;
  primaryLabel: string;
  onSave: (w: number, l: number) => void;
}) {
  const [w, setW] = useState("");
  const [l, setL] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${fieldIdPrefix}-w`}>רוחב במ״מ</Label>
          <Input
            id={`${fieldIdPrefix}-w`}
            value={w}
            inputMode="decimal"
            onChange={(e) => {
              setW(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldIdPrefix}-l`}>אורך במ״מ</Label>
          <Input
            id={`${fieldIdPrefix}-l`}
            value={l}
            inputMode="decimal"
            onChange={(e) => {
              setL(e.target.value);
              setError(null);
            }}
          />
        </div>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() => {
          const wn = Number(String(w).replace(",", "."));
          const ln = Number(String(l).replace(",", "."));
          if (
            !Number.isFinite(wn) ||
            !(wn > 0) ||
            !Number.isFinite(ln) ||
            !(ln > 0)
          ) {
            setError("יש להזין רוחב ואורך גדולים מאפס.");
            return;
          }
          onSave(wn, ln);
        }}
      >
        {primaryLabel}
      </Button>
    </div>
  );
}
