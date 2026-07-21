"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ContinueWithIssuesDialog({
  open,
  unresolvedCount,
  onBack,
  onContinueAnyway,
}: {
  open: boolean;
  unresolvedCount: number;
  onBack: () => void;
  onContinueAnyway: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onBack()}>
      <DialogContent className="max-w-md" dir="rtl" aria-describedby="cont-desc">
        <DialogHeader>
          <DialogTitle>להמשיך עם פריטים שדורשים טיפול?</DialogTitle>
        </DialogHeader>
        <p id="cont-desc" className="text-sm text-muted-foreground">
          נשארו {unresolvedCount} פריטים שעדיין אינם מוכנים לחלוטין לתמחור.
        </p>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" onClick={onBack}>
            חזור לטיפול
          </Button>
          <Button type="button" variant="outline" onClick={onContinueAnyway}>
            המשך בכל זאת
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
