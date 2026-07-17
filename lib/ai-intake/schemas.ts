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
  /** Email statement order (1-based). Null for document-derived facts. */
  statementIndex: z.number().int().nullable().optional(),
  /** Email only: clear replacement of a prior email value. */
  explicitlySupersedesPrevious: z.boolean().optional(),
  emailFactId: z.string().nullable().optional(),
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

const lengthUnitSchema = z.enum(["MM", "CM", "M"]).nullable();
const areaUnitSchema = z.enum(["MM2", "CM2", "M2"]).nullable();

/** Explicit structured geometry from XLSX/PDF — evidence only, never authoritative. */
export const extractedDocumentGeometrySchema = z.object({
  width: z.number().nullable(),
  widthUnit: lengthUnitSchema,
  height: z.number().nullable(),
  heightUnit: lengthUnitSchema,
  area: z.number().nullable(),
  areaUnit: areaUnitSchema,
  perimeter: z.number().nullable(),
  perimeterUnit: lengthUnitSchema,
  unitWeightKg: z.number().nullable(),
  totalWeightKg: z.number().nullable(),
  widthCell: z.string().nullable(),
  heightCell: z.string().nullable(),
  areaCell: z.string().nullable(),
  perimeterCell: z.string().nullable(),
  unitWeightCell: z.string().nullable(),
  totalWeightCell: z.string().nullable(),
});

export type ExtractedDocumentGeometry = z.infer<
  typeof extractedDocumentGeometrySchema
>;

export function emptyDocumentGeometry(): ExtractedDocumentGeometry {
  return {
    width: null,
    widthUnit: null,
    height: null,
    heightUnit: null,
    area: null,
    areaUnit: null,
    perimeter: null,
    perimeterUnit: null,
    unitWeightKg: null,
    totalWeightKg: null,
    widthCell: null,
    heightCell: null,
    areaCell: null,
    perimeterCell: null,
    unitWeightCell: null,
    totalWeightCell: null,
  };
}

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
  documentGeometry: extractedDocumentGeometrySchema,
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
  documentGeometry: extractedDocumentGeometrySchema,
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

const emailFactCommon = {
  factId: z.string().min(1),
  statementIndex: z.number().int().positive(),
  matchedDxfPartId: z.string().nullable(),
  rawPartReference: z.string().nullable(),
  explicitlySupersedesPrevious: z.boolean(),
  sourceExcerpt: z.string(),
};

export const extractedEmailFactSchema = z.discriminatedUnion("field", [
  z.object({
    ...emailFactCommon,
    field: z.literal("QUANTITY"),
    value: z.number(),
    instructionType: z.enum(["VALUE", "DEFAULT", "OVERRIDE"]),
  }),
  z.object({
    ...emailFactCommon,
    field: z.literal("THICKNESS"),
    value: z.number(),
    instructionType: z.enum(["VALUE", "DEFAULT", "OVERRIDE"]),
  }),
  z.object({
    ...emailFactCommon,
    field: z.literal("MATERIAL"),
    value: z.string(),
    instructionType: z.enum(["VALUE", "DEFAULT", "OVERRIDE"]),
  }),
  z.object({
    ...emailFactCommon,
    field: z.literal("INCLUDE"),
    value: z.boolean(),
    instructionType: z.enum(["VALUE", "EXCLUSION"]),
  }),
  z.object({
    ...emailFactCommon,
    field: z.literal("EXCLUDE"),
    value: z.boolean(),
    instructionType: z.enum(["VALUE", "EXCLUSION"]),
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

/** Checkpoint 5.1/5.2 workbook evidence attached to spreadsheet source results (debug). */
export type WorkbookEvidenceDebug = {
  parserKind: "EXCELJS_XLSX" | "SHEETJS_XLS";
  snapshot: unknown;
  mapping: unknown;
  coverage: unknown;
  rawPartRows: unknown;
  excludedTotalSubtotalRows: unknown;
  unknownRows: unknown;
  hiddenPartRowsRequiringReview: unknown;
  columnUnitProfiles?: unknown;
  normalizedMeasurements?: unknown;
  precisionComparisons?: unknown;
  /** Checkpoint 5.2 table-level joint unit inference (per table). */
  tableUnitInference?: unknown;
};

export type SourceDocumentResult = {
  documentId: string;
  sourceType: "XLSX" | "PDF";
  fileName: string;
  rows: ExtractedDocumentRow[];
  unresolvedItems: UnresolvedRequestItem[];
  warnings: string[];
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  errorCode: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  durationMs: number;
  /** Present for XLS/XLSX after Checkpoint 5.1 deterministic parse path. */
  workbookEvidence?: WorkbookEvidenceDebug | null;
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
  /** Optional bbox for Checkpoint 5.2 unit correlation (never sent to OpenAI as file). */
  widthMm: z.number().nullable().optional(),
  heightMm: z.number().nullable().optional(),
  plateAreaMm2: z.number().nullable().optional(),
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
  statementIndex?: number | null;
  sourceExcerpt?: string | null;
  explicitlySupersedesPrevious?: boolean;
};

export type FieldResolutionStatus =
  | "SINGLE_SOURCE"
  | "CONSENSUS"
  | "OVERRIDE"
  | "EMAIL_AUTHORITATIVE"
  | "EMAIL_EXPLICIT_SUPERSESSION"
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

export type GeometryComparisonStatus =
  | "MATCH"
  | "MATCH_AFTER_DOCUMENT_ROUNDING"
  | "MISMATCH"
  | "PARTIAL_MATCH"
  | "NOT_COMPARABLE";

export type GeometryComparisonCandidate = {
  sourceType: "XLSX" | "PDF";
  sourceLabel: string;
  documentWidthMm: number | null;
  documentHeightMm: number | null;
  documentAreaMm2: number | null;
  documentPerimeterMm: number | null;
  documentUnitWeightKg: number | null;
  documentTotalWeightKg: number | null;
  /** Raw source values for UI when units are ambiguous / not converted. */
  rawWidth: number | null;
  rawWidthUnit: "MM" | "CM" | "M" | null;
  rawHeight: number | null;
  rawHeightUnit: "MM" | "CM" | "M" | null;
  rawArea: number | null;
  rawAreaUnit: "MM2" | "CM2" | "M2" | null;
  areaComparisonNote: string | null;
  comparisonStatus: GeometryComparisonStatus;
  issues: string[];
};

export type RowGeometryComparisonStatus =
  | "MATCH"
  | "MISMATCH"
  | "PARTIAL"
  | "NOT_AVAILABLE";

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
  /** Bounding-box plate envelope (width × height). Main table "שטח". */
  plateAreaMm2: number | null;
  /** Net contour area from geometry engine — debug / weight only. */
  netContourAreaMm2: number | null;
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
  geometryComparisons: GeometryComparisonCandidate[];
  geometryComparisonStatus: RowGeometryComparisonStatus;
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
