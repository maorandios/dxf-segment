/**
 * Classify whether a source should trigger a provider extraction call.
 * Deterministic — no AI.
 */

export type SourceProviderEligibilityReason =
  | "HAS_MEANINGFUL_TEXT"
  | "HAS_SUPPORTED_ATTACHMENT_CONTENT"
  | "EMPTY_TEXT"
  | "WHITESPACE_ONLY"
  | "METADATA_ONLY"
  | "DUPLICATE_CONTENT"
  | "UNSUPPORTED_SOURCE"
  | "ALREADY_HANDLED_DETERMINISTICALLY";

export type SourceProviderEligibility = {
  eligible: boolean;
  reason: SourceProviderEligibilityReason;
  meaningfulCharacterCount: number;
  attachmentCount: number;
  uniqueAttachmentCount: number;
};

export type ProviderCallPurpose =
  | "WORKBOOK_INITIAL_PLAN"
  | "WORKBOOK_PLAN_REPAIR"
  | "WORKBOOK_DIRECT_EXTRACTION"
  | "WORKBOOK_DIRECT_CORRECTION"
  | "PDF_EXTRACTION"
  | "EMAIL_EXTRACTION"
  | "DOCUMENT_EXTRACTION"
  | "OTHER";

export type ProviderCallRecord = {
  providerCallId: string;
  provider: string;
  model: string;
  purpose: ProviderCallPurpose;
  sourceIds: string[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  inputCharacters: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  skipped: boolean;
  skipReason: string | null;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
};

/**
 * Strip common metadata-only patterns from email-like text.
 * Does not inspect fixture-specific project names — only structural emptiness.
 */
export function meaningfulTextCharacterCount(text: string | null | undefined): number {
  if (text == null) return 0;
  let t = String(text);
  // Remove pure whitespace
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return 0;
  // Generated session labels like "Quote — Project / Customer" with no body
  // are treated as metadata when very short and lack sentence structure.
  return t.length;
}

export function classifySourceForProviderExtraction(args: {
  kind: "EMAIL" | "PDF" | "XLSX" | "OTHER";
  subject?: string | null;
  body?: string | null;
  /** Attachments already processed by their own deterministic/document pipeline. */
  alreadyHandledAttachmentIds?: string[];
  attachmentIds?: string[];
  /** Workbook already interpreted deterministically — skip generic doc extraction. */
  alreadyHandledDeterministically?: boolean;
}): SourceProviderEligibility {
  const attachments = args.attachmentIds ?? [];
  const handled = new Set(args.alreadyHandledAttachmentIds ?? []);
  const uniqueUnhandled = attachments.filter((id) => !handled.has(id));

  if (args.alreadyHandledDeterministically && args.kind === "XLSX") {
    return {
      eligible: false,
      reason: "ALREADY_HANDLED_DETERMINISTICALLY",
      meaningfulCharacterCount: 0,
      attachmentCount: attachments.length,
      uniqueAttachmentCount: uniqueUnhandled.length,
    };
  }

  if (args.kind === "EMAIL") {
    const body = args.body ?? "";
    const trimmed = body.trim();
    const bodyChars = meaningfulTextCharacterCount(trimmed);

    if (!trimmed) {
      if (uniqueUnhandled.length > 0) {
        return {
          eligible: true,
          reason: "HAS_SUPPORTED_ATTACHMENT_CONTENT",
          meaningfulCharacterCount: 0,
          attachmentCount: attachments.length,
          uniqueAttachmentCount: uniqueUnhandled.length,
        };
      }
      return {
        eligible: false,
        reason: body.length > 0 ? "WHITESPACE_ONLY" : "EMPTY_TEXT",
        meaningfulCharacterCount: 0,
        attachmentCount: attachments.length,
        uniqueAttachmentCount: 0,
      };
    }

    // Subject-only / metadata-only: body is empty of semantic content
    // after whitespace collapse, or body equals subject (copied label).
    const subject = (args.subject ?? "").trim();
    if (
      trimmed === subject ||
      (bodyChars < 40 && /^quote[\s\S]{0,40}$/i.test(trimmed) && !/[.!?]\s+\S/.test(trimmed))
    ) {
      if (uniqueUnhandled.length > 0) {
        return {
          eligible: true,
          reason: "HAS_SUPPORTED_ATTACHMENT_CONTENT",
          meaningfulCharacterCount: bodyChars,
          attachmentCount: attachments.length,
          uniqueAttachmentCount: uniqueUnhandled.length,
        };
      }
      return {
        eligible: false,
        reason: "METADATA_ONLY",
        meaningfulCharacterCount: bodyChars,
        attachmentCount: attachments.length,
        uniqueAttachmentCount: 0,
      };
    }

    return {
      eligible: true,
      reason: "HAS_MEANINGFUL_TEXT",
      meaningfulCharacterCount: bodyChars,
      attachmentCount: attachments.length,
      uniqueAttachmentCount: uniqueUnhandled.length,
    };
  }

  if (args.kind === "PDF" || args.kind === "XLSX") {
    return {
      eligible: !args.alreadyHandledDeterministically,
      reason: args.alreadyHandledDeterministically
        ? "ALREADY_HANDLED_DETERMINISTICALLY"
        : "HAS_SUPPORTED_ATTACHMENT_CONTENT",
      meaningfulCharacterCount: 0,
      attachmentCount: attachments.length,
      uniqueAttachmentCount: uniqueUnhandled.length,
    };
  }

  return {
    eligible: false,
    reason: "UNSUPPORTED_SOURCE",
    meaningfulCharacterCount: 0,
    attachmentCount: attachments.length,
    uniqueAttachmentCount: uniqueUnhandled.length,
  };
}

export function summarizeProviderCalls(records: ProviderCallRecord[]): {
  totalProviderCallCount: number;
  skippedCount: number;
  byPurpose: Record<string, number>;
  nonSkippedCount: number;
} {
  const byPurpose: Record<string, number> = {};
  let skipped = 0;
  let nonSkipped = 0;
  for (const r of records) {
    byPurpose[r.purpose] = (byPurpose[r.purpose] ?? 0) + 1;
    if (r.skipped || r.status === "SKIPPED") skipped += 1;
    else nonSkipped += 1;
  }
  return {
    totalProviderCallCount: nonSkipped,
    skippedCount: skipped,
    byPurpose,
    nonSkippedCount: nonSkipped,
  };
}
