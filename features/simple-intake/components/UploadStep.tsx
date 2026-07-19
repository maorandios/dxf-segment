"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";

type UploadNotice = {
  kind: "duplicate" | "unsupported" | "info";
  message: string;
};

function isWorkbookName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

function isDxfName(name: string): boolean {
  return name.toLowerCase().endsWith(".dxf");
}

export function UploadStep() {
  const session = useSimpleIntakeSession();
  const wbRef = useRef<HTMLInputElement>(null);
  const dxfRef = useRef<HTMLInputElement>(null);
  const [notices, setNotices] = useState<UploadNotice[]>([]);

  const canAnalyze =
    session.workbookFile != null && session.dxfFiles.length > 0;

  return (
    <Card className="mx-auto w-full max-w-2xl border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Simple Intake</CardTitle>
        <CardDescription>
          העלו קובץ Excel אחד (XLS/XLSX) וקובצי DXF. ניתוח ישיר ללא צינור מורכב.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">קובץ Excel</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => wbRef.current?.click()}
            >
              בחר Excel
            </Button>
            <input
              ref={wbRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!f) {
                  simpleIntakeActions.setWorkbook(null);
                  return;
                }
                if (!isWorkbookName(f.name)) {
                  setNotices((n) => [
                    ...n,
                    {
                      kind: "unsupported",
                      message: `קובץ לא נתמך: ${f.name}`,
                    },
                  ]);
                  return;
                }
                simpleIntakeActions.setWorkbook(f);
                setNotices([]);
              }}
            />
            <span className="text-sm text-muted-foreground">
              {session.workbookFile?.name ?? "לא נבחר"}
            </span>
            {session.workbookFile && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => simpleIntakeActions.setWorkbook(null)}
              >
                הסר
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">קובצי DXF</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => dxfRef.current?.click()}
            >
              הוסף DXF
            </Button>
            <input
              ref={dxfRef}
              type="file"
              accept=".dxf"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files
                  ? Array.from(e.target.files)
                  : [];
                e.target.value = "";
                const nextNotices: UploadNotice[] = [];
                const accepted: File[] = [];
                const existing = new Set(session.dxfFiles.map((f) => f.name));
                for (const f of list) {
                  if (!isDxfName(f.name)) {
                    nextNotices.push({
                      kind: "unsupported",
                      message: `קובץ לא נתמך: ${f.name}`,
                    });
                    continue;
                  }
                  if (existing.has(f.name)) {
                    nextNotices.push({
                      kind: "duplicate",
                      message: `שם כפול (דולג): ${f.name}`,
                    });
                    continue;
                  }
                  accepted.push(f);
                  existing.add(f.name);
                }
                if (accepted.length > 0) {
                  simpleIntakeActions.addDxfFiles(accepted);
                }
                setNotices(nextNotices);
              }}
            />
            <span className="text-sm text-muted-foreground">
              {session.dxfFiles.length} קבצים
            </span>
          </div>
          {session.dxfFiles.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-auto text-sm">
              {session.dxfFiles.map((f: File) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between gap-2 rounded bg-white/[0.04] px-2 py-1"
                >
                  <span className="truncate">{f.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => simpleIntakeActions.removeDxf(f.name)}
                  >
                    הסר
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {notices.length > 0 && (
          <ul className="space-y-1 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {notices.map((n, i) => (
              <li key={`${n.message}-${i}`}>{n.message}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!canAnalyze}
            onClick={() => void simpleIntakeActions.analyze()}
          >
            נתח
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
