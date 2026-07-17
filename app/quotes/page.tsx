"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  deleteQuoteFromList,
  getQuotesList,
  subscribeQuotesListChanged,
  type QuoteListRecord,
  type QuoteListStatus,
} from "@/lib/quotes/quoteList";
import { t } from "@/lib/i18n";

function listStepLabel(step: number): string {
  if (step >= 1 && step <= 7) {
    return t(`quotes.listStepLabels.${step}` as `quotes.listStepLabels.${number}`);
  }
  return t("quotes.stepFallback", { n: step });
}

function statusBadge(status: QuoteListStatus) {
  if (status === "complete") {
    return (
      <Badge variant="secondary" className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-200">
        {t("quotes.statusComplete")}
      </Badge>
    );
  }
  return <Badge variant="outline">{t("quotes.statusInProgress")}</Badge>;
}

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function QuotesPage() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeQuotesListChanged(() => setTick((t) => t + 1));
  }, []);

  const rows = useMemo(() => getQuotesList(), [tick]);

  const handleDelete = useCallback((q: QuoteListRecord) => {
    if (!confirm(t("quotes.removeConfirm", { ref: q.referenceNumber }))) return;
    deleteQuoteFromList(q.id);
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title={t("quotes.title")}
        description={t("quotes.description")}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/quotes/new" className="gap-2">
                <PlusCircle className="h-4 w-4 me-2" />
                {t("quotes.newQuote")}
              </Link>
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t("quotes.emptyTitle")}
          description={t("quotes.emptyDescription")}
          action={
            <Button asChild>
              <Link href="/quotes/new" className="gap-2">
                <PlusCircle className="h-4 w-4 me-2" />
                {t("quotes.newQuote")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("quotes.colReference")}</TableHead>
                <TableHead>{t("quotes.colClient")}</TableHead>
                <TableHead>{t("quotes.colStatus")}</TableHead>
                <TableHead>{t("quotes.colPhase")}</TableHead>
                <TableHead>{t("quotes.colUpdated")}</TableHead>
                <TableHead className="text-end w-[140px]">{t("quotes.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-sm">{q.referenceNumber}</TableCell>
                  <TableCell className="font-medium max-w-[220px] truncate">
                    {q.customerName || "—"}
                  </TableCell>
                  <TableCell>{statusBadge(q.status)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {listStepLabel(q.currentStep)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatUpdated(q.updatedAt)}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/quotes/new">{t("quotes.openBuilder")}</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(q)}
                        aria-label={t("quotes.removeAria", { ref: q.referenceNumber })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}
