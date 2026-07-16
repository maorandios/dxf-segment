import { z } from "zod";

/** Shared source shape for expanded atomic facts + unresolved items. */
export const factSourceSchema = z.object({
  type: z.enum(["EMAIL", "XLSX", "PDF"]),
  fileName: z.string().nullable(),
  sheetName: z.string().nullable(),
  rowNumber: z.number().int().nullable(),
  cellReferences: z.array(z.string()),
  pageNumber: z.number().int().nullable(),
  excerpt: z.string().nullable(),
});

const factBase = {
  matchedDxfPartId: z.string().nullable(),
  rawPartReference: z.string().nullable(),
  instructionType: z.enum(["VALUE", "DEFAULT", "OVERRIDE", "EXCLUSION"]),
  source: factSourceSchema,
  issues: z.array(z.string()),
};

export const extractedRequestFactSchema = z.discriminatedUnion("field", [
  z.object({
    ...factBase,
    field: z.literal("QUANTITY"),
    value: z.number().nullable(),
  }),
  z.object({
    ...factBase,
    field: z.literal("THICKNESS"),
    value: z.number().nullable(),
  }),
  z.object({
    ...factBase,
    field: z.literal("MATERIAL"),
    value: z.string().nullable(),
  }),
  z.object({
    ...factBase,
    field: z.literal("DESCRIPTION"),
    value: z.string().nullable(),
  }),
  z.object({
    ...factBase,
    field: z.literal("INCLUDE"),
    value: z.boolean().nullable(),
  }),
  z.object({
    ...factBase,
    field: z.literal("EXCLUDE"),
    value: z.boolean().nullable(),
  }),
]);

export type ExtractedRequestFact = z.infer<typeof extractedRequestFactSchema>;

const documentLocationSchema = z.object({
  sheetName: z.string().nullable(),
  visibleRowNumber: z.number().int().nullable(),
  pageNumber: z.number().int().nullable(),
  partReferenceCell: z.string().nullable(),
  quantityCell: z.string().nullable(),
  thicknessCell: z.string().nullable(),
  materialCell: z.string().nullable(),
  excerpt: z.string().nullable(),
});

/** Model-only row (no file identity — server injects documentId/fileName). */
export const singleDocumentModelRowSchema = z.object({
  matchedDxfPartId: z.string().nullable(),
  rawPartReference: z.string().nullable(),
  quantity: z.number().nullable(),
  thicknessMm: z.number().nullable(),
  material: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  action: z.enum(["INCLUDE", "EXCLUDE"]).nullable(),
  location: documentLocationSchema,
  issues: z.array(z.string()),
});

export const singleDocumentExtractionSchema = z.object({
  rows: z.array(singleDocumentModelRowSchema),
  unresolvedItems: z.array(
    z.object({
      rawPartReference: z.string().nullable(),
      description: z.string(),
      reason: z.string(),
      location: z.object({
        sheetName: z.string().nullable(),
        visibleRowNumber: z.number().int().nullable(),
        pageNumber: z.number().int().nullable(),
        excerpt: z.string().nullable(),
      }),
    })
  ),
  warnings: z.array(z.string()),
});

export type SingleDocumentExtraction = z.infer<
  typeof singleDocumentExtractionSchema
>;

/** Complete XLSX/PDF row after server injects authoritative source metadata. */
export const extractedDocumentRowSchema = z.object({
  documentId: z.string().min(1),
  matchedDxfPartId: z.string().nullable(),
  rawPartReference: z.string().nullable(),
  quantity: z.number().nullable(),
  thicknessMm: z.number().nullable(),
  material: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  action: z.enum(["INCLUDE", "EXCLUDE"]).nullable(),
  source: z.object({
    type: z.enum(["XLSX", "PDF"]),
    fileName: z.string().min(1),
    sheetName: z.string().nullable(),
    rowNumber: z.number().int().nullable(),
    pageNumber: z.number().int().nullable(),
    partReferenceCell: z.string().nullable(),
    quantityCell: z.string().nullable(),
    thicknessCell: z.string().nullable(),
    materialCell: z.string().nullable(),
    excerpt: z.string().nullable(),
  }),
  issues: z.array(z.string()),
});

export type ExtractedDocumentRow = z.infer<typeof extractedDocumentRowSchema>;

export const extractedEmailFactSchema = z.discriminatedUnion("field", [
  z.object({
    matchedDxfPartId: z.string().nullable(),
    rawPartReference: z.string().nullable(),
    field: z.literal("QUANTITY"),
    value: z.number(),
    instructionType: z.enum(["VALUE", "DEFAULT", "OVERRIDE"]),
    sourceExcerpt: z.string(),
  }),
  z.object({
    matchedDxfPartId: z.string().nullable(),
    rawPartReference: z.string().nullable(),
    field: z.literal("THICKNESS"),
    value: z.number(),
    instructionType: z.enum(["VALUE", "DEFAULT", "OVERRIDE"]),
    sourceExcerpt: z.string(),
  }),
  z.object({
    matchedDxfPartId: z.string().nullable(),
    rawPartReference: z.string().nullable(),
    field: z.literal("MATERIAL"),
    value: z.string(),
    instructionType: z.enum(["VALUE", "DEFAULT", "OVERRIDE"]),
    sourceExcerpt: z.string(),
  }),
  z.object({
    matchedDxfPartId: z.string().nullable(),
    rawPartReference: z.string().nullable(),
    field: z.literal("INCLUDE"),
    value: z.boolean(),
    instructionType: z.enum(["VALUE", "EXCLUSION"]),
    sourceExcerpt: z.string(),
  }),
  z.object({
    matchedDxfPartId: z.string().nullable(),
    rawPartReference: z.string().nullable(),
    field: z.literal("EXCLUDE"),
    value: z.boolean(),
    instructionType: z.enum(["VALUE", "EXCLUSION"]),
    sourceExcerpt: z.string(),
  }),
]);

export type ExtractedEmailFact = z.infer<typeof extractedEmailFactSchema>;

export const emailExtractionSchema = z.object({
  emailFacts: z.array(extractedEmailFactSchema),
  unresolvedItems: z.array(
    z.object({
      rawPartReference: z.string().nullable(),
      description: z.string(),
      possibleDxfPartIds: z.array(z.string()),
      reason: z.string(),
      sourceExcerpt: z.string().nullable(),
    })
  ),
  warnings: z.array(z.string()),
});

export type EmailExtraction = z.infer<typeof emailExtractionSchema>;

export const unresolvedRequestItemSchema = z.object({
  rawPartReference: z.string().nullable(),
  description: z.string(),
  possibleDxfPartIds: z.array(z.string()),
  reason: z.string(),
  source: factSourceSchema,
});

export type UnresolvedRequestItem = z.infer<typeof unresolvedRequestItemSchema>;

/** Aggregated extraction (server-built; not the OpenAI schema). */
export const aiRequestExtractionSchema = z.object({
  documentRows: z.array(extractedDocumentRowSchema),
  emailFacts: z.array(extractedEmailFactSchema),
  unresolvedItems: z.array(unresolvedRequestItemSchema),
  warnings: z.array(z.string()),
});

export type AiRequestExtraction = z.infer<typeof aiRequestExtractionSchema>;

export type SourceDocumentDescriptor = {
  documentId: string;
  sourceType: "XLSX" | "PDF";
  fileName: string;
};

export type SourceDocumentResult = {
  documentId: string;
  sourceType: "XLSX" | "PDF";
  fileName: string;
  rows: ExtractedDocumentRow[];
  unresolvedItems: UnresolvedRequestItem[];
  warnings: string[];
  status: "SUCCESS" | "FAILED";
  errorCode: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  durationMs: number;
};

export type AggregatedSourceExtraction = {
  documents: SourceDocumentResult[];
  emailFacts: ExtractedEmailFact[];
  expandedFacts: ExtractedRequestFact[];
  emailUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  } | null;
  emailDurationMs: number | null;
  openaiCallCount: number;
  partial: boolean;
};

export const slimRegistryItemSchema = z.object({
  canonicalPartId: z.string().min(1),
  revision: z.string().nullable(),
  filename: z.string().min(1),
});

export type SlimRegistryItem = z.infer<typeof slimRegistryItemSchema>;

export type DocumentDxfAuditStatus =
  | "MATCHED"
  | "MAPPING_REQUIRES_REVIEW"
  | "REQUEST_PART_NOT_IN_DXF"
  | "DXF_NOT_REFERENCED"
  | "SOURCE_FAILED";

export type DocumentDxfAuditRow = {
  status: DocumentDxfAuditStatus;
  rawPartReference: string | null;
  matchedDxfPartId: string | null;
  sourceType: "EMAIL" | "XLSX" | "PDF" | null;
  sourceLabel: string | null;
  extractedQuantity: number | null;
  extractedThicknessMm: number | null;
  extractedMaterial: string | null;
  reason: string | null;
  documentId?: string | null;
  hasDocumentAndEmail?: boolean;
};

export type DocumentDxfAuditSummary = {
  customerPartsSeen: number;
  matchedCount: number;
  requestWithoutDxfCount: number;
  dxfNotReferencedCount: number;
  requiresReviewCount: number;
  failedSourceCount: number;
};

export type FinalFieldSource =
  | "USER_RESOLUTION"
  | "EMAIL_OVERRIDE"
  | "EMAIL"
  | "CONSENSUS"
  | "XLSX"
  | "PDF"
  | "DEFAULT"
  | null;

export type FieldCandidate<T extends string | number> = {
  value: T;
  sourceType: "XLSX" | "PDF" | "EMAIL";
  sourceLabel: string;
  instructionType?: "VALUE" | "OVERRIDE" | "DEFAULT";
};

export type FieldResolutionStatus =
  | "SINGLE_SOURCE"
  | "CONSENSUS"
  | "OVERRIDE"
  | "EMAIL_AUTHORITATIVE"
  | "USER_RESOLUTION"
  | "CONFLICT"
  | "MISSING";

/** Provenance for one commercial field — all agreeing sources preserved. */
export type ResolvedCommercialField<T extends string | number> = {
  value: T | null;
  resolutionStatus: FieldResolutionStatus;
  candidates: FieldCandidate<T>[];
};

export type RequestPartOccurrence = {
  occurrenceId: string;
  matchedDxfPartId: string | null;
  rawPartReference: string | null;
  quantity: number | null;
  thicknessMm: number | null;
  material: string | null;
  description: string | null;
  action: "INCLUDE" | "EXCLUDE" | null;
  source: {
    documentId: string | null;
    type: "XLSX" | "PDF" | "EMAIL";
    fileName: string | null;
    sheetName: string | null;
    rowNumber: number | null;
    pageNumber: number | null;
    excerpt: string | null;
  };
  /** True when this occurrence is pending / ignored for quantity (identical duplicate extras). */
  currentlyIgnored?: boolean;
};

export type DuplicateOccurrenceStatus =
  | "NONE"
  | "IDENTICAL_DUPLICATE"
  | "REPEATED_WITH_DIFFERENT_VALUES"
  | "RESOLVED_IGNORE"
  | "RESOLVED_SUM"
  | "RESOLVED_KEEP_SEPARATE";

export type DuplicateUserAction = "IGNORE" | "SUM" | "KEEP_SEPARATE";

export type FinalIntakeMappingStatus =
  | "READY"
  | "NEEDS_REVIEW"
  | "EXCLUDED"
  | "DXF_NOT_REQUESTED"
  | "REQUEST_WITHOUT_DXF"
  | "DXF_IDENTITY_CONFLICT"
  | "DXF_REVISION_CONFLICT";

export type FinalIntakeMappingRow = {
  status: FinalIntakeMappingStatus;
  partId: string | null;
  /** Optional UI label for secondary keep-separate rows, e.g. "P1095 — הופעה 2". */
  displayLabel: string | null;
  revision: string | null;
  dxfFileId: string | null;
  dxfFilename: string | null;
  widthMm: number | null;
  heightMm: number | null;
  areaMm2: number | null;
  perimeterMm: number | null;
  quantity: number | null;
  thicknessMm: number | null;
  material: string | null;
  description: string | null;
  action: "INCLUDE" | "EXCLUDE" | null;
  /** @deprecated Prefer fieldResolutions — single primary when consensus is ambiguous. */
  fieldSources: {
    quantity: FinalFieldSource;
    thickness: FinalFieldSource;
    material: FinalFieldSource;
  };
  fieldCandidates: {
    quantity: FieldCandidate<number>[];
    thickness: FieldCandidate<number>[];
    material: FieldCandidate<string>[];
  };
  fieldResolutions: {
    quantity: ResolvedCommercialField<number>;
    thickness: ResolvedCommercialField<number>;
    material: ResolvedCommercialField<string>;
  };
  previousValues: Array<{
    field: "QUANTITY" | "THICKNESS" | "MATERIAL";
    value: string | number;
    source: "EMAIL" | "XLSX" | "PDF";
  }>;
  hasDocumentSource: boolean;
  hasEmailSource: boolean;
  hasDocumentAndEmail: boolean;
  contributingFacts: ExtractedRequestFact[];
  sourceEvidence: Array<{
    type: "EMAIL" | "XLSX" | "PDF" | "DXF";
    label: string;
  }>;
  issues: string[];
  requestOccurrences: RequestPartOccurrence[];
  occurrenceCount: number;
  duplicateOccurrenceCount: number;
  duplicateStatus: DuplicateOccurrenceStatus;
  ignoredOccurrences: RequestPartOccurrence[];
  duplicateIssues: string[];
};

export type AiIntakeAnalyzeSuccess = {
  ok: true;
  extraction: AiRequestExtraction;
  acceptedFacts: ExtractedRequestFact[];
  aggregated: AggregatedSourceExtraction;
  auditRows: DocumentDxfAuditRow[];
  auditSummary: DocumentDxfAuditSummary;
  finalRows?: FinalIntakeMappingRow[];
  warnings: string[];
  partial: boolean;
  debug: {
    model: string;
    durationMs: number;
    openaiCallCount: number;
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
    };
    perSourceUsage: Array<{
      label: string;
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      durationMs: number;
      status: string;
    }>;
  };
};

export type AiIntakeAnalyzeFailure = {
  ok: false;
  code: string;
  messageHe: string;
};

export type AiIntakeAnalyzeResponse =
  | AiIntakeAnalyzeSuccess
  | AiIntakeAnalyzeFailure;
