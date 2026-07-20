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
  kind: "unsupported" | "info";
  message: string;
};

function isWorkbookName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

export function UploadStep() {
  const session = useSimpleIntakeSession();
  const wbRef = useRef<HTMLInputElement>(null);
  const [notices, setNotices] = useState<UploadNotice[]>([]);

  const canAnalyze = session.workbookFile != null;

  return (
    <Card className="mx-auto w-full max-w-2xl border-0 shadow-sm" dir="rtl">
      <CardHeader>
        <CardTitle className="text-2xl">העלאת רשימת חומר</CardTitle>
        <CardDescription>
          העלה קובץ Excel ואנחנו נסדר אותו לרשימת חומר ברורה ואחידה.
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
                  setNotices([
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
          <p className="text-xs text-muted-foreground">קבצים נתמכים: .xlsx · .xls</p>
        </div>

        {notices.length > 0 && (
          <ul className="space-y-1 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {notices.map((n, i) => (
              <li key={`${n.message}-${i}`}>{n.message}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            disabled={!canAnalyze}
            onClick={() => void simpleIntakeActions.analyze()}
          >
            נתח את הקובץ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
