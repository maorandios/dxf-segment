"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { clientFormSchema, type ClientFormValues } from "@/lib/utils/schemas";
import type { Client } from "@/types";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ClientFormProps {
  defaultValues?: Partial<ClientFormValues>;
  onSubmit: (values: ClientFormValues) => void;
  onCancel?: () => void;
  submitLabel?: string;
  mode?: "create" | "edit";
  /** Tighter spacing + scroll region for viewport-fit layouts */
  compact?: boolean;
  /** If true, ביטול asks for confirmation when the form has unsaved changes */
  warnOnUnsavedCancel?: boolean;
}

const emptyDefaults: ClientFormValues = {
  fullName: "",
  companyRegistrationNumber: "",
  contactName: "",
  email: "",
  phone: "",
  city: "",
  notes: "",
};

export function ClientForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
  mode = "create",
  compact = false,
  warnOnUnsavedCancel = false,
}: ClientFormProps) {
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { ...emptyDefaults, ...defaultValues },
  });

  /** Must subscribe in render — otherwise `isDirty` stays stale in handlers (RHF proxy). */
  const { isDirty } = form.formState;

  const resolvedSubmit =
    submitLabel ??
    (mode === "create"
      ? t("clientForm.submitCreate")
      : t("clientForm.submitSave"));

  const itemGap = compact ? "space-y-4" : "space-y-5";
  const labelClass = compact ? "text-sm" : "";

  function handleCancelClick() {
    if (!onCancel) return;
    if (warnOnUnsavedCancel && isDirty) {
      setUnsavedDialogOpen(true);
    } else {
      onCancel();
    }
  }

  function confirmLeaveWithoutSaving() {
    setUnsavedDialogOpen(false);
    onCancel?.();
  }

  return (
    <Form {...form}>
      <Dialog open={unsavedDialogOpen} onOpenChange={setUnsavedDialogOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="sr-only">
              {t("clientEdit.unsavedTitle")}
            </DialogTitle>
            <DialogDescription className="text-right text-sm leading-relaxed text-foreground">
              {t("clientEdit.unsavedWarning")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            className="flex flex-row flex-wrap gap-2 sm:justify-start"
            dir="rtl"
          >
            <Button
              type="button"
              variant="destructive"
              onClick={confirmLeaveWithoutSaving}
            >
              {t("clientEdit.unsavedLeave")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUnsavedDialogOpen(false)}
            >
              {t("clientEdit.unsavedStay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "flex w-full flex-col",
          compact ? "min-h-0 flex-1 overflow-hidden" : "",
          !compact && "space-y-6"
        )}
        dir="rtl"
      >
        <div
          className={cn(
            compact
              ? "min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 pb-2 sm:px-3"
              : "space-y-6"
          )}
        >
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem className={itemGap}>
                <FormLabel className={labelClass}>
                  {t("clientForm.companyName")}{" "}
                  <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("clientForm.placeholderCompany")}
                    className={compact ? "h-9" : undefined}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyRegistrationNumber"
            render={({ field }) => (
              <FormItem className={itemGap}>
                <FormLabel className={labelClass}>
                  {t("clientForm.companyRegistration")}{" "}
                  <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("clientForm.placeholderCompanyReg")}
                    inputMode="numeric"
                    autoComplete="off"
                    className={compact ? "h-9" : undefined}
                    {...field}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      field.onChange(v);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactName"
            render={({ field }) => (
              <FormItem className={itemGap}>
                <FormLabel className={labelClass}>
                  {t("clientForm.contactName")}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("clientForm.placeholderContact")}
                    className={compact ? "h-9" : undefined}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className={itemGap}>
                  <FormLabel className={labelClass}>
                    {t("clientForm.email")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t("clientForm.placeholderEmail")}
                      className={compact ? "h-9" : undefined}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem className={itemGap}>
                  <FormLabel className={labelClass}>
                    {t("clientForm.phone")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("clientForm.placeholderPhone")}
                      inputMode="numeric"
                      className={compact ? "h-9" : undefined}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        field.onChange(v);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem className={itemGap}>
                <FormLabel className={labelClass}>{t("clientForm.city")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("clientForm.placeholderCity")}
                    className={compact ? "h-9" : undefined}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className={itemGap}>
                <FormLabel className={labelClass}>{t("clientForm.notes")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("clientForm.notesPlaceholder")}
                    rows={compact ? 2 : 4}
                    className={cn(
                      "resize-y",
                      compact ? "min-h-[52px] text-sm" : "min-h-[100px]"
                    )}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div
          className={cn(
            "mt-auto flex shrink-0 flex-wrap items-center gap-3 border-t border-white/[0.08] px-2 pb-1 pt-5 sm:px-3 sm:pt-6",
            compact && "mt-3"
          )}
          dir="ltr"
        >
          <Button type="submit" size={compact ? "default" : "lg"}>
            {resolvedSubmit}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={handleCancelClick}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

export function clientFormValuesFromClient(c: Client): ClientFormValues {
  const digitsOnly = (s: string | undefined) =>
    s ? s.replace(/\D/g, "") : "";
  return {
    fullName: c.fullName,
    companyRegistrationNumber: digitsOnly(c.companyRegistrationNumber) || "",
    contactName: c.contactName ?? "",
    email: c.email ?? "",
    phone: digitsOnly(c.phone) || "",
    city: c.city ?? "",
    notes: c.notes ?? "",
  };
}
