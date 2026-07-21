"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppPreferences } from "@/features/settings/useAppPreferences";
import { UserAccountMenu } from "../workbookUpload/UserAccountMenu";
import { EditQuoteDetailsDialog } from "../quoteWorkflow/EditQuoteDetailsDialog";
import type { QuoteWorkspaceDetails } from "../types";
import { firstNameFromFullName } from "../workbookUpload/uploadScreenTokens";

export function OmegaHeader({
  quoteDetails,
  statusText,
  onReplaceWorkbook,
  onDownloadDebug,
  canDownloadDebug,
}: {
  quoteDetails: QuoteWorkspaceDetails | null;
  statusText?: string;
  onReplaceWorkbook?: () => void;
  onDownloadDebug?: () => void;
  canDownloadDebug?: boolean;
}) {
  const { preferences } = useAppPreferences();
  const fullName = preferences.companyName?.trim() || "מאור סבג";
  const email =
    preferences.companyEmail?.trim() || "Maor.andios@gmail.com";
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <header
        className="flex h-14 shrink-0 items-center justify-between gap-4 border-b ps-4 pe-5 sm:h-16 sm:ps-6 sm:pe-8"
        style={{
          backgroundColor: "var(--ow-surface)",
          borderColor: "var(--ow-border)",
        }}
      >
        {/* RTL: first = visual right */}
        <div className="min-w-0">
          <p
            className="text-[15px] font-semibold tracking-[0.04em]"
            style={{ color: "var(--ow-text)" }}
          >
            OMEGA
          </p>
          {quoteDetails ? (
            <>
              <p
                className="truncate text-[13px] font-medium"
                style={{ color: "var(--ow-text-secondary)" }}
              >
                {quoteDetails.projectName}
              </p>
              <p
                className="truncate text-[12px]"
                style={{ color: "var(--ow-text-muted)" }}
              >
                {quoteDetails.customerName}
              </p>
            </>
          ) : (
            <p
              className="truncate text-[13px]"
              style={{ color: "var(--ow-text-secondary)" }}
            >
              הצעת מחיר חדשה
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {statusText && (
            <p
              className="hidden text-[12px] lg:block"
              style={{ color: "var(--ow-text-muted)" }}
            >
              {statusText}
            </p>
          )}
          <UserAccountMenu user={{ fullName, email }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="תפריט הצעה"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              {quoteDetails && (
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  עריכת פרטי הצעה
                </DropdownMenuItem>
              )}
              {onReplaceWorkbook && (
                <DropdownMenuItem onSelect={() => onReplaceWorkbook()}>
                  החלף קובץ Excel
                </DropdownMenuItem>
              )}
              {onDownloadDebug && (
                <DropdownMenuItem
                  disabled={!canDownloadDebug}
                  onSelect={() => onDownloadDebug()}
                >
                  הורד נתוני אבחון
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <EditQuoteDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        details={quoteDetails}
      />
    </>
  );
}

/** Keep helper available for tests/consumers that inspect first-name greeting. */
export function omegaHeaderGreetingName(fullName: string | null): string {
  return fullName ? firstNameFromFullName(fullName) ?? "שלום" : "שלום";
}
