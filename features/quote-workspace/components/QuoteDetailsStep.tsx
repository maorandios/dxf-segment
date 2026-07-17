"use client";

import { useCallback, useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canCreateQuote,
  normalizeQuoteName,
  quoteFieldErrorMessage,
  validateQuoteName,
  type QuoteFieldError,
} from "../quoteDetailsValidation";
import {
  getQuoteSessionState,
  quoteSessionActions,
} from "../quoteSessionStore";
import { QuoteSessionPrivacyNotice } from "./QuoteSessionPrivacyNotice";

export function QuoteDetailsStep(props: {
  initialProjectName?: string;
  initialCustomerName?: string;
  onCancelHref?: string;
}) {
  const projectId = useId();
  const customerId = useId();
  const [projectName, setProjectName] = useState(
    props.initialProjectName ?? ""
  );
  const [customerName, setCustomerName] = useState(
    props.initialCustomerName ?? ""
  );
  const [projectError, setProjectError] = useState<QuoteFieldError>(null);
  const [customerError, setCustomerError] = useState<QuoteFieldError>(null);
  const [touched, setTouched] = useState({ project: false, customer: false });

  const validateAll = useCallback(() => {
    const p = validateQuoteName(projectName, "project");
    const c = validateQuoteName(customerName, "customer");
    setProjectError(p);
    setCustomerError(c);
    setTouched({ project: true, customer: true });
    return p == null && c == null;
  }, [customerName, projectName]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateAll()) return;
      const details = {
        projectName: normalizeQuoteName(projectName),
        customerName: normalizeQuoteName(customerName),
      };
      const existing = getQuoteSessionState().session;
      if (existing) {
        quoteSessionActions.updateQuoteDetails(details);
        quoteSessionActions.goToFilesStep();
      } else {
        quoteSessionActions.createQuote(details);
      }
    },
    [customerName, projectName, validateAll]
  );

  const valuesCanCreate = canCreateQuote({
    projectName,
    customerName,
  });
  // Disable only when current values cannot create a valid quote (after
  // the user has interacted, still allow submit of empty to show errors).
  const submitDisabled =
    touched.project && touched.customer && !valuesCanCreate;
  const showProjectErr = Boolean(touched.project && projectError);
  const showCustomerErr = Boolean(touched.customer && customerError);

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm">
      <CardHeader className="space-y-2 text-center sm:text-start">
        <CardTitle className="text-2xl tracking-tight">
          הצעת מחיר חדשה
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          הזן את פרטי הפרויקט כדי להתחיל לרכז את החומר להצעת המחיר.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor={projectId}>שם הפרויקט</Label>
            <Input
              id={projectId}
              name="projectName"
              autoComplete="organization"
              placeholder="לדוגמה: קונסטרוקציית גג צפוני"
              value={projectName}
              aria-invalid={showProjectErr ? true : undefined}
              aria-describedby={
                showProjectErr ? `${projectId}-error` : undefined
              }
              onChange={(e) => {
                setProjectName(e.target.value);
                if (touched.project) {
                  setProjectError(
                    validateQuoteName(e.target.value, "project")
                  );
                }
              }}
              onBlur={() => {
                setTouched((t) => ({ ...t, project: true }));
                setProjectError(validateQuoteName(projectName, "project"));
              }}
            />
            {showProjectErr && (
              <p
                id={`${projectId}-error`}
                className="text-sm text-destructive"
                role="alert"
              >
                {quoteFieldErrorMessage(projectError)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={customerId}>שם הלקוח</Label>
            <Input
              id={customerId}
              name="customerName"
              autoComplete="name"
              placeholder="לדוגמה: אלמוג מתכות"
              value={customerName}
              aria-invalid={showCustomerErr ? true : undefined}
              aria-describedby={
                showCustomerErr ? `${customerId}-error` : undefined
              }
              onChange={(e) => {
                setCustomerName(e.target.value);
                if (touched.customer) {
                  setCustomerError(
                    validateQuoteName(e.target.value, "customer")
                  );
                }
              }}
              onBlur={() => {
                setTouched((t) => ({ ...t, customer: true }));
                setCustomerError(validateQuoteName(customerName, "customer"));
              }}
            />
            {showCustomerErr && (
              <p
                id={`${customerId}-error`}
                className="text-sm text-destructive"
                role="alert"
              >
                {quoteFieldErrorMessage(customerError)}
              </p>
            )}
          </div>

          <QuoteSessionPrivacyNotice variant="details" />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" asChild>
              <Link href={props.onCancelHref ?? "/quotes"}>ביטול</Link>
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              המשך להעלאת קבצים
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
