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

function isDxfName(name: string): boolean {
  return name.toLowerCase().endsWith(".dxf");
}

export function DxfUploadStage() {
  const session = useSimpleIntakeSession();
  const dxfRef = useRef<HTMLInputElement>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canMatch = session.dxfFiles.length > 0 && !busy;

  return (
    <Card className="mx-auto w-full max-w-2xl border-0 shadow-sm" dir="rtl">
      <CardHeader>
        <CardTitle className="text-2xl">העלאת קובצי DXF</CardTitle>
        <CardDescription>
          העלה את קובצי ה-DXF כדי להתאים גאומטריה לפריטים ולחשב שטח ומשקל.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {session.materialListRows.length} פריטים מאושרים ·{" "}
          {session.dxfFiles.length} קובצי DXF
        </p>

        <div className="space-y-2">
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
                const list = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = "";
                const nextNotices: string[] = [];
                const accepted: File[] = [];
                const existing = new Set(session.dxfFiles.map((f) => f.name));
                for (const f of list) {
                  if (!isDxfName(f.name)) {
                    nextNotices.push(`קובץ לא נתמך: ${f.name}`);
                    continue;
                  }
                  if (existing.has(f.name)) {
                    nextNotices.push(`שם כפול (דולג): ${f.name}`);
                    continue;
                  }
                  accepted.push(f);
                  existing.add(f.name);
                }
                if (accepted.length) {
                  simpleIntakeActions.addDxfFiles(accepted);
                }
                setNotices(nextNotices);
              }}
            />
          </div>
          {session.dxfFiles.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-auto text-sm">
              {session.dxfFiles.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1"
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
          <ul className="space-y-1 rounded-md bg-amber-500/10 px-3 py-2 text-sm">
            {notices.map((n, i) => (
              <li key={`${n}-${i}`}>{n}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => simpleIntakeActions.backToMaterialList()}
          >
            חזרה לרשימת החומר
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={!canMatch}
            onClick={() => {
              setBusy(true);
              void simpleIntakeActions
                .runDxfStageFromApprovedList()
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "מעבד קבצים…" : "נתח והתאם קבצים"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
