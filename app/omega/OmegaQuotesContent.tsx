"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type QuoteRow = {
  id: number;
  name: string;
  date: Date;
  status: "בתהליך" | "הושלם";
};

const DUMMY_QUOTES: QuoteRow[] = Array.from({ length: 25 }, (_, i) => {
  const day = 1 + (i % 27);
  const month = 1 + (i % 12);
  const year = 2025 + Math.floor(i / 40);
  return {
    id: i + 1,
    name:
      i % 4 === 0
        ? `הצעת מחיר — פרויקט ${i + 1}`
        : i % 4 === 1
          ? `ייצור ${20 + i} יחידות`
          : i % 4 === 2
            ? `חיתוך לייזר #${1000 + i}`
            : `פלטה מכופפת — ${i + 1}`,
    date: new Date(year, month - 1, day),
    status: i % 3 === 0 ? "הושלם" : "בתהליך",
  };
});

function formatDate(d: Date): string {
  return d.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function OmegaQuotesContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0" dir="rtl">
      <section
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
        aria-labelledby="omega-quotes-heading"
      >
        <h2
          id="omega-quotes-heading"
          className="shrink-0 text-lg font-semibold tracking-tight text-foreground"
        >
          הצעות מחיר
        </h2>

        <div className="omega-app-surface-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl sm:rounded-3xl">
          <Table containerClassName="relative min-h-0 w-full flex-1 overflow-auto">
            <TableHeader className="sticky top-0 z-[1] bg-[var(--omega-surface)] shadow-sm [&_tr]:border-border/60">
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="min-w-[11rem] font-semibold text-foreground">
                  שם הצעה
                </TableHead>
                <TableHead className="min-w-[7rem] font-semibold text-foreground">
                  תאריך
                </TableHead>
                <TableHead className="min-w-[9rem] font-semibold text-foreground">
                  סטאטוס
                </TableHead>
                <TableHead className="w-[4.5rem] text-center font-semibold text-foreground">
                  מחק
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DUMMY_QUOTES.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-border/40 hover:bg-muted/40"
                >
                  <TableCell className="font-medium text-foreground">
                    {row.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatDate(row.date)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                        row.status === "הושלם"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground hover:text-destructive"
                      aria-label={`מחק הצעה ${row.name}`}
                      onClick={() => {
                        /* TODO: מחיקה */
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="w-full shrink-0 border-t border-border/25 bg-[var(--omega-page-bg)] pt-5">
        <Button
          asChild
          size="lg"
          className="w-full min-h-12 rounded-2xl px-8 shadow-lg shadow-primary/25"
        >
          <Link href="/omega/new">יצירת הצעה חדשה</Link>
        </Button>
      </div>
    </div>
  );
}
