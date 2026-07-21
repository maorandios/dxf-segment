"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { simpleIntakeActions } from "../sessionStore";
import type { QuoteWorkspaceDetails } from "../types";

function EditQuoteDetailsForm({
  details,
  onClose,
}: {
  details: QuoteWorkspaceDetails;
  onClose: () => void;
}) {
  const [projectName, setProjectName] = useState(details.projectName);
  const [customerName, setCustomerName] = useState(details.customerName);
  const canSave =
    projectName.trim().length > 0 && customerName.trim().length > 0;

  return (
    <>
      <div className="space-y-3 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-name">שם הפרויקט</Label>
          <Input
            id="edit-project-name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-customer-name">שם הלקוח</Label>
          <Input
            id="edit-customer-name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
        <Button type="button" variant="outline" onClick={onClose}>
          ביטול
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (
              simpleIntakeActions.updateQuoteDetails({
                projectName,
                customerName,
              })
            ) {
              onClose();
            }
          }}
        >
          שמור
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditQuoteDetailsDialog({
  open,
  onOpenChange,
  details,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: QuoteWorkspaceDetails | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת פרטי הצעה</DialogTitle>
          <DialogDescription>
            עדכון שם הפרויקט והלקוח יוצג מיד בכותרת סביבת העבודה.
          </DialogDescription>
        </DialogHeader>
        {details && open ? (
          <EditQuoteDetailsForm
            key={`${details.projectName}|${details.customerName}|${open}`}
            details={details}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
