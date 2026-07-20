"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ApproveWithMissingDialog({
  open,
  incompleteCount,
  onBack,
  onContinueAnyway,
}: {
  open: boolean;
  incompleteCount: number;
  onBack: () => void;
  onContinueAnyway: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onBack();
      }}
    >
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>להמשיך עם נתונים חסרים?</DialogTitle>
          <DialogDescription>
            נשארו {incompleteCount} שורות שדורשות השלמה. אפשר להמשיך, אבל ייתכן
            שלא יהיה ניתן לחשב או לתמחר אותן עד להשלמת הנתונים.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
          <Button type="button" variant="outline" onClick={onBack}>
            חזור להשלמה
          </Button>
          <Button type="button" onClick={onContinueAnyway}>
            המשך בכל זאת
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
