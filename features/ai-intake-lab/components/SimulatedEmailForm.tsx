"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { t } from "@/lib/i18n";
import {
  filterRegistryItems,
  summarizeDxfRegistry,
} from "@/lib/ai-intake/buildDxfRegistry";
import { buildSlimRegistryForAi } from "@/lib/ai-intake/slimRegistry";
import { reconcileFinalMapping } from "@/lib/ai-intake/reconcileFinalMapping";
import { applyDuplicateUserResolution } from "@/lib/ai-intake/requestOccurrences";
import { applyEmailQuantityUserResolution } from "@/lib/ai-intake/emailConflictResolve";
import type {
  AiIntakeAnalyzeResponse,
  AiIntakeAnalyzeSuccess,
  DuplicateUserAction,
  FinalIntakeMappingRow,
} from "@/lib/ai-intake/schemas";
import type {
  DxfPartRegistryItem,
  DxfRegistryFilter,
} from "@/lib/ai-intake/types";
import type { IntakeAttachment } from "../lib/attachmentClassify";
import {
  runLocalDxfRegistry,
  type LocalDxfRegistryProgress,
} from "../lib/runLocalDxfRegistry";
import { AttachmentList } from "./AttachmentList";
import { AttachmentUploadZone } from "./AttachmentUploadZone";
import { DocumentDxfAuditSummaryCards } from "./DocumentDxfAuditSummary";
import { DocumentDxfAuditTable } from "./DocumentDxfAuditTable";
import { DxfRegistryFilters } from "./DxfRegistryFilters";
import { DxfRegistryPreview } from "./DxfRegistryPreview";
import { DxfRegistrySummaryCards } from "./DxfRegistrySummary";
import { DxfRegistryTable } from "./DxfRegistryTable";
import { FinalMappingTable } from "./FinalMappingTable";
import { IntakeDebugPanel } from "./IntakeDebugPanel";

const emptyForm = {
  sender: "",
  subject: "",
  body: "",
};

type UiPhase =
  | "idle"
  | "reading_dxf"
  | "building_registry"
  | "analyzing_openai"
  | "validating"
  | "done"
  | "failed";

export function SimulatedEmailForm() {
  const [sender, setSender] = useState(emptyForm.sender);
  const [subject, setSubject] = useState(emptyForm.subject);
  const [body, setBody] = useState(emptyForm.body);
  const [attachments, setAttachments] = useState<IntakeAttachment[]>([]);
  const [registryItems, setRegistryItems] = useState<DxfPartRegistryItem[]>([]);
  const [filter, setFilter] = useState<DxfRegistryFilter>("all");
  const [progress, setProgress] = useState<LocalDxfRegistryProgress | null>(
    null
  );
  const [uiPhase, setUiPhase] = useState<UiPhase>("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] =
    useState<AiIntakeAnalyzeSuccess | null>(null);
  const [previewItem, setPreviewItem] = useState<DxfPartRegistryItem | null>(
    null
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [duplicateResolutions, setDuplicateResolutions] = useState<
    Record<string, DuplicateUserAction>
  >({});
  const [emailQuantityResolutions, setEmailQuantityResolutions] = useState<
    Record<string, number>
  >({});

  const dxfAttachments = useMemo(
    () => attachments.filter((a) => a.kind === "dxf"),
    [attachments]
  );
  const docAttachments = useMemo(
    () => attachments.filter((a) => a.kind === "excel" || a.kind === "pdf"),
    [attachments]
  );

  const attachmentCountLabel = useMemo(() => {
    if (attachments.length === 1) return t("aiIntake.countFileOne");
    return t("aiIntake.countFiles", { count: attachments.length });
  }, [attachments.length]);

  const summary = useMemo(
    () => summarizeDxfRegistry(registryItems),
    [registryItems]
  );

  const filterCounts = useMemo(() => {
    return {
      all: filterRegistryItems(registryItems, "all").length,
      valid: filterRegistryItems(registryItems, "valid").length,
      identityProblems: filterRegistryItems(registryItems, "identityProblems")
        .length,
      revisionDuplicate: filterRegistryItems(registryItems, "revisionDuplicate")
        .length,
      geometryIssues: filterRegistryItems(registryItems, "geometryIssues")
        .length,
    } satisfies Record<DxfRegistryFilter, number>;
  }, [registryItems]);

  const filteredItems = useMemo(
    () => filterRegistryItems(registryItems, filter),
    [registryItems, filter]
  );

  const finalRows = useMemo(() => {
    if (!analyzeResult) return [];
    const { rows } = reconcileFinalMapping({
      registry: registryItems,
      acceptedFacts: analyzeResult.acceptedFacts,
      unresolvedItems: analyzeResult.extraction.unresolvedItems,
      documentRows: analyzeResult.extraction.documentRows,
    });
    const out: FinalIntakeMappingRow[] = [];
    for (const row of rows) {
      let next = row;
      const dupAction = row.partId ? duplicateResolutions[row.partId] : undefined;
      if (dupAction) {
        const applied = applyDuplicateUserResolution(next, dupAction);
        out.push(...applied);
        continue;
      }
      const emailQty = row.partId
        ? emailQuantityResolutions[row.partId]
        : undefined;
      if (emailQty != null) {
        next = applyEmailQuantityUserResolution(next, emailQty);
      }
      out.push(next);
    }
    return out;
  }, [
    analyzeResult,
    registryItems,
    duplicateResolutions,
    emailQuantityResolutions,
  ]);

  useEffect(() => {
    setDuplicateResolutions({});
    setEmailQuantityResolutions({});
  }, [analyzeResult]);

  const handleDuplicateResolve = useCallback(
    (partId: string, action: DuplicateUserAction) => {
      setDuplicateResolutions((prev) => ({ ...prev, [partId]: action }));
    },
    []
  );

  const handleEmailQuantityResolve = useCallback(
    (partId: string, quantity: number) => {
      setEmailQuantityResolutions((prev) => ({ ...prev, [partId]: quantity }));
    },
    []
  );

  const analyzeResultWithFinal = useMemo(() => {
    if (!analyzeResult) return null;
    return { ...analyzeResult, finalRows };
  }, [analyzeResult, finalRows]);

  const debugReportContext = useMemo(() => {
    const dxfParts = registryItems.map((item) => ({
      partId: item.canonicalPartId,
      fileName: item.filename,
      bboxWidthMm: item.widthMm,
      bboxHeightMm: item.heightMm,
      plateAreaMm2: item.plateAreaMm2,
      netContourAreaMm2: item.netContourAreaMm2,
      geometryStatus: item.geometryStatus,
    }));

    const emails =
      body.trim().length > 0
        ? [
            {
              emailId: null as string | null,
              subject: subject.trim() || null,
              bodyText: body,
              sourceLabel: "simulated-email" as string | null,
            },
          ]
        : [];

    const inputDocuments = analyzeResultWithFinal
      ? analyzeResultWithFinal.aggregated.documents.map((d) => {
          const att = docAttachments.find((a) => a.file.name === d.fileName);
          return {
            documentId: d.documentId,
            sourceType: d.sourceType,
            fileName: d.fileName,
            mimeType: att?.file.type || null,
            sizeBytes: att?.file.size ?? null,
          };
        })
      : docAttachments.map((a, i) => ({
          documentId: `pending:${i}:${a.file.name}`,
          sourceType:
            a.kind === "pdf" ? "PDF" : ("XLSX" as const),
          fileName: a.file.name,
          mimeType: a.file.type || null,
          sizeBytes: a.file.size,
        }));

    return { dxfParts, emails, inputDocuments };
  }, [
    registryItems,
    body,
    subject,
    analyzeResultWithFinal,
    docAttachments,
  ]);

  const phaseLabel = useMemo(() => {
    switch (uiPhase) {
      case "reading_dxf":
        return progress
          ? t(progress.messageKey, progress.messageVars)
          : t("aiIntake.progress.reading");
      case "building_registry":
        return t("aiIntake.progress.buildingRegistry");
      case "analyzing_openai":
        return t("aiIntake.progress.analyzingOpenAi");
      case "validating":
        return t("aiIntake.progress.validatingMatches");
      case "done":
        return t("aiIntake.progress.done");
      case "failed":
        return t("aiIntake.progress.failed");
      default:
        return null;
    }
  }, [uiPhase, progress]);

  const handleAddFiles = useCallback((next: IntakeAttachment[]) => {
    setAttachments((prev) => [...prev, ...next]);
    setErrorMessage(null);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setErrorMessage(null);
  }, []);

  const handleReset = useCallback(() => {
    setSender(emptyForm.sender);
    setSubject(emptyForm.subject);
    setBody(emptyForm.body);
    setAttachments([]);
    setRegistryItems([]);
    setFilter("all");
    setProgress(null);
    setUiPhase("idle");
    setIsBusy(false);
    setErrorMessage(null);
    setAnalyzeResult(null);
    setPreviewItem(null);
    setPreviewOpen(false);
    setDuplicateResolutions({});
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (dxfAttachments.length === 0) {
      setErrorMessage(t("aiIntake.registry.noDxf"));
      setRegistryItems([]);
      setAnalyzeResult(null);
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setAnalyzeResult(null);
    setUiPhase("reading_dxf");
    setProgress({
      phase: "reading",
      messageKey: "aiIntake.progress.reading",
    });

    try {
      const { items } = await runLocalDxfRegistry(
        dxfAttachments.map((a) => a.file),
        (p) => {
          setProgress(p);
          if (p.phase === "building" || p.phase === "duplicates") {
            setUiPhase("building_registry");
          } else if (p.phase === "reading" || p.phase === "geometry") {
            setUiPhase("reading_dxf");
          }
        }
      );
      setRegistryItems(items);
      setFilter("all");

      const slim = buildSlimRegistryForAi(items);
      if (slim.length === 0) {
        setErrorMessage(t("aiIntake.analyze.noValidRegistry"));
        setUiPhase("failed");
        return;
      }

      setUiPhase("analyzing_openai");

      const form = new FormData();
      form.set("sender", sender);
      form.set("subject", subject);
      form.set("body", body);
      form.set("registryJson", JSON.stringify(slim));
      for (const att of docAttachments) {
        form.append("documents", att.file, att.file.name);
      }

      const res = await fetch("/api/ai-intake/analyze", {
        method: "POST",
        body: form,
      });

      setUiPhase("validating");

      const data = (await res.json()) as AiIntakeAnalyzeResponse;
      if (!data.ok) {
        setErrorMessage(data.messageHe);
        setUiPhase("failed");
        return;
      }

      setAnalyzeResult(data);
      setUiPhase("done");
    } catch {
      setErrorMessage(t("aiIntake.analyze.requestFailed"));
      setUiPhase("failed");
    } finally {
      setIsBusy(false);
    }
  }, [body, docAttachments, dxfAttachments, sender, subject]);

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm rounded-xl">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-lg tracking-tight">
            {t("aiIntake.emailSectionTitle")}
          </CardTitle>
          <CardDescription>{t("aiIntake.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-intake-sender">{t("aiIntake.senderLabel")}</Label>
            <Input
              id="ai-intake-sender"
              type="email"
              dir="ltr"
              className="text-start"
              autoComplete="email"
              placeholder={t("aiIntake.senderPlaceholder")}
              value={sender}
              onChange={(e) => setSender(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-intake-subject">{t("aiIntake.subjectLabel")}</Label>
            <Input
              id="ai-intake-subject"
              placeholder={t("aiIntake.subjectPlaceholder")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-intake-body">{t("aiIntake.bodyLabel")}</Label>
            <Textarea
              id="ai-intake-body"
              rows={8}
              placeholder={t("aiIntake.bodyPlaceholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[160px] resize-y"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm rounded-xl">
        <CardHeader className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg tracking-tight">
              {t("aiIntake.attachmentsTitle")}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {attachmentCountLabel}
            </span>
          </div>
          <CardDescription>{t("aiIntake.attachmentsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <AttachmentUploadZone onAddFiles={handleAddFiles} />
          <AttachmentList attachments={attachments} onRemove={handleRemove} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={isBusy}
        >
          {t("aiIntake.resetForm")}
        </Button>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button type="button" onClick={handleAnalyze} disabled={isBusy}>
            {isBusy
              ? t("aiIntake.analyze.runningCta")
              : t("aiIntake.analyzeCta")}
          </Button>
          <p className="max-w-md text-xs text-muted-foreground sm:text-end">
            {errorMessage
              ? errorMessage
              : phaseLabel
                ? phaseLabel
                : t("aiIntake.analyze.hint")}
          </p>
        </div>
      </div>

      {registryItems.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("aiIntake.registry.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("aiIntake.registry.subtitle")}
            </p>
            <p className="mt-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground">
              {t("aiIntake.registry.dxfOnlyNotice")}
            </p>
          </div>

          <DxfRegistrySummaryCards summary={summary} />
          <DxfRegistryFilters
            value={filter}
            onChange={setFilter}
            counts={filterCounts}
          />
          <DxfRegistryTable
            items={filteredItems}
            onPreview={(item) => {
              setPreviewItem(item);
              setPreviewOpen(true);
            }}
          />
        </section>
      )}

      {analyzeResultWithFinal && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("aiIntake.final.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("aiIntake.final.subtitle")}
            </p>
          </div>
          {analyzeResultWithFinal.partial && (
            <div
              className="rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
              role="status"
            >
              {t("aiIntake.partialBanner")}
            </div>
          )}
          <FinalMappingTable
            rows={finalRows}
            onDuplicateResolve={handleDuplicateResolve}
            onEmailQuantityResolve={handleEmailQuantityResolve}
            canPreview={(row) => {
              if (!row.dxfFileId) return false;
              const item = registryItems.find((r) => r.id === row.dxfFileId);
              return Boolean(
                item?.processedGeometry &&
                  item.processedGeometry.outer.length > 0 &&
                  item.geometryStatus !== "INVALID"
              );
            }}
            onPreview={(row) => {
              const item = registryItems.find((r) => r.id === row.dxfFileId);
              if (item) {
                setPreviewItem(item);
                setPreviewOpen(true);
              }
            }}
          />
        </section>
      )}

      {analyzeResultWithFinal && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("aiIntake.audit.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("aiIntake.audit.subtitle")}
            </p>
          </div>
          <DocumentDxfAuditSummaryCards
            summary={analyzeResultWithFinal.auditSummary}
          />
          <DocumentDxfAuditTable rows={analyzeResultWithFinal.auditRows} />
        </section>
      )}

      <section className="space-y-4">
        <IntakeDebugPanel
          result={analyzeResultWithFinal}
          reportContext={debugReportContext}
        />
      </section>

      <DxfRegistryPreview
        item={previewItem}
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewItem(null);
        }}
      />
    </div>
  );
}
