"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDecimal, formatInteger } from "@/lib/formatNumbers";
import type { Client, ClientMetrics } from "@/types";
import { deleteGlobalClient } from "@/lib/store";
import { t } from "@/lib/i18n";

export interface ClientsTableProps {
  clients: Client[];
  metricsById: Record<string, ClientMetrics>;
  onChanged?: () => void;
}

export function ClientsTable({
  clients,
  metricsById,
  onChanged,
}: ClientsTableProps) {
  const [clientPendingDelete, setClientPendingDelete] = useState<Client | null>(
    null
  );

  function handleConfirmDelete() {
    if (!clientPendingDelete) return;
    deleteGlobalClient(clientPendingDelete.id);
    setClientPendingDelete(null);
    onChanged?.();
  }

  /** # fixed; שם לקוח = 2fr; remaining seven columns share 1fr each. */
  const gridCols =
    "2.5rem minmax(200px, 2fr) repeat(7, minmax(0, 1fr))" as const;

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.08]" dir="rtl">
      <Dialog
        open={!!clientPendingDelete}
        onOpenChange={(open) => {
          if (!open) setClientPendingDelete(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
        >
          <DialogHeader className="space-y-3 text-right sm:text-right">
            <DialogTitle className="sr-only">
              {t("pages.clients.deleteModalTitle")}
            </DialogTitle>
            <DialogDescription className="text-right text-sm leading-relaxed text-foreground">
              {clientPendingDelete
                ? t("pages.clients.deleteModalBody", {
                    name: clientPendingDelete.fullName,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            className="flex flex-row flex-wrap gap-2 sm:justify-start"
            dir="rtl"
          >
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              {t("pages.clients.deleteModalConfirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClientPendingDelete(null)}
            >
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Table
        className="grid w-full border-collapse border-spacing-0 [&_thead]:contents [&_tbody]:contents [&_tr]:contents"
        style={{ gridTemplateColumns: gridCols }}
      >
        <TableHeader className="contents">
          <TableRow className="contents border-0 hover:bg-transparent">
            <TableHead className="flex h-full min-h-12 w-full items-center justify-center border-b border-white/[0.08] font-medium">
              {t("pages.clients.table.colIndex")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-start border-b border-white/[0.08] text-right font-medium">
              {t("pages.clients.table.colName")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-start border-b border-white/[0.08] text-right font-medium">
              {t("pages.clients.table.colCompanyReg")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-start border-b border-white/[0.08] text-right font-medium">
              {t("pages.clients.table.colClientId")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-start border-b border-white/[0.08] text-right tabular-nums font-medium">
              {t("pages.clients.table.colWeight")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-start border-b border-white/[0.08] text-right tabular-nums font-medium">
              {t("pages.clients.table.colArea")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-start border-b border-white/[0.08] text-right tabular-nums font-medium">
              {t("pages.clients.table.colPartQty")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-center border-b border-white/[0.08] font-medium">
              {t("pages.clients.table.colView")}
            </TableHead>
            <TableHead className="flex h-full min-h-12 w-full items-center justify-center border-b border-white/[0.08] font-medium">
              {t("pages.clients.table.colDelete")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="contents">
          {clients.map((c, index) => {
            const m = metricsById[c.id];
            const reg = c.companyRegistrationNumber?.trim();
            return (
              <TableRow key={c.id} className="contents border-0">
                <TableCell className="text-center tabular-nums text-muted-foreground border-b border-white/[0.06]">
                  {index + 1}
                </TableCell>
                <TableCell className="min-w-0 text-right font-medium truncate border-b border-white/[0.06]">
                  {c.fullName}
                </TableCell>
                <TableCell className="min-w-0 text-right text-sm text-muted-foreground tabular-nums border-b border-white/[0.06]">
                  <span className="block truncate">{reg || "—"}</span>
                </TableCell>
                <TableCell className="min-w-0 border-b border-white/[0.06] text-right">
                  <span className="font-mono text-sm font-bold tracking-wider block truncate">
                    {c.shortCode}
                  </span>
                </TableCell>
                <TableCell className="min-w-0 text-right tabular-nums border-b border-white/[0.06]">
                  {formatDecimal(m?.totalWeight ?? 0, 1)}
                </TableCell>
                <TableCell className="min-w-0 text-right tabular-nums border-b border-white/[0.06]">
                  {formatDecimal(m?.totalAreaM2 ?? 0, 2)}
                </TableCell>
                <TableCell className="min-w-0 text-right tabular-nums border-b border-white/[0.06]">
                  {formatInteger(m?.totalQuantity ?? 0)}
                </TableCell>
                <TableCell className="flex h-full min-h-12 w-full items-center justify-center border-b border-white/[0.06] p-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    asChild
                  >
                    <Link
                      href={`/clients/${c.id}`}
                      title={t("pages.clients.table.viewAria")}
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
                <TableCell className="flex h-full min-h-12 w-full items-center justify-center border-b border-white/[0.06] p-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    type="button"
                    title={t("pages.clients.table.deleteAria")}
                    onClick={() => setClientPendingDelete(c)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
