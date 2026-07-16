import type { DxfPartRegistryItem } from "./types";
import { normalizePartId } from "./normalizePartId";
import type {
  ExtractedDocumentRow,
  ExtractedRequestFact,
  FieldCandidate,
  FieldResolutionStatus,
  FinalFieldSource,
  FinalIntakeMappingRow,
  FinalIntakeMappingStatus,
  RequestPartOccurrence,
  ResolvedCommercialField,
  UnresolvedRequestItem,
} from "./schemas";
import { DXF_ISSUE } from "./types";
import { formatDocumentSourceLabel } from "./visibleRowNumber";
import {
  buildRequestOccurrences,
  canonicalKeyForOccurrence,
  classifyPartOccurrences,
  emptyOccurrenceFields,
  filterFactsForOccurrencePolicy,
  type PartOccurrenceClassification,
} from "./requestOccurrences";
import {
  compareDocumentsToDxfGeometry,
  hasBlockingGeometryIssue,
} from "./compareDocumentDxfGeometry";

export type ResolveFieldResult = {
  value: string | number | null;
  /** Single primary when SINGLE_SOURCE / OVERRIDE / DEFAULT; null for CONSENSUS / CONFLICT / MISSING. */
  source: FinalFieldSource;
  resolutionStatus: FieldResolutionStatus;
  previousValues: Array<{
    field: "QUANTITY" | "THICKNESS" | "MATERIAL";
    value: string | number;
    source: "EMAIL" | "XLSX" | "PDF";
  }>;
  issues: string[];
  candidates: FieldCandidate<string | number>[];
};

const EMPTY_NUMBER_RESOLUTION: ResolvedCommercialField<number> = {
  value: null,
  resolutionStatus: "MISSING",
  candidates: [],
};

const EMPTY_STRING_RESOLUTION: ResolvedCommercialField<string> = {
  value: null,
  resolutionStatus: "MISSING",
  candidates: [],
};

function distinctSourceTypes(
  candidates: FieldCandidate<string | number>[]
): Array<"XLSX" | "PDF" | "EMAIL"> {
  const order: Array<"XLSX" | "PDF" | "EMAIL"> = ["XLSX", "PDF", "EMAIL"];
  const present = new Set(candidates.map((c) => c.sourceType));
  return order.filter((t) => present.has(t));
}

function toNumberResolution(
  result: ResolveFieldResult
): ResolvedCommercialField<number> {
  return {
    value: typeof result.value === "number" ? result.value : null,
    resolutionStatus: result.resolutionStatus,
    candidates: result.candidates.filter(
      (c): c is FieldCandidate<number> => typeof c.value === "number"
    ),
  };
}

function toStringResolution(
  result: ResolveFieldResult
): ResolvedCommercialField<string> {
  return {
    value: typeof result.value === "string" ? result.value : null,
    resolutionStatus: result.resolutionStatus,
    candidates: result.candidates.filter(
      (c): c is FieldCandidate<string> => typeof c.value === "string"
    ),
  };
}

function candidateFromFact(
  fact: ExtractedRequestFact
): FieldCandidate<string | number> | null {
  if (fact.value == null) return null;
  if (
    fact.source.type !== "XLSX" &&
    fact.source.type !== "PDF" &&
    fact.source.type !== "EMAIL"
  ) {
    return null;
  }
  if (typeof fact.value !== "string" && typeof fact.value !== "number") {
    return null;
  }
  if (
    fact.instructionType !== "VALUE" &&
    fact.instructionType !== "OVERRIDE" &&
    fact.instructionType !== "DEFAULT"
  ) {
    return null;
  }
  // DEFAULT candidates are only useful when they win; still collect for debug.
  if (
    fact.instructionType === "DEFAULT" &&
    fact.source.type !== "EMAIL"
  ) {
    return null;
  }
  return {
    value: fact.value,
    sourceType: fact.source.type,
    sourceLabel: formatDocumentSourceLabel({
      type: fact.source.type,
      fileName: fact.source.fileName,
      sheetName: fact.source.sheetName,
      rowNumber: fact.source.rowNumber,
      cellReferences: fact.source.cellReferences,
      pageNumber: fact.source.pageNumber,
    }),
    instructionType: fact.instructionType,
    statementIndex: fact.statementIndex ?? null,
    sourceExcerpt: fact.source.excerpt,
    explicitlySupersedesPrevious: Boolean(fact.explicitlySupersedesPrevious),
  };
}

function collectFieldCandidates(
  facts: ExtractedRequestFact[],
  field: "QUANTITY" | "THICKNESS" | "MATERIAL"
): FieldCandidate<string | number>[] {
  const out: FieldCandidate<string | number>[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    if (fact.field !== field || fact.value == null) continue;
    // Keep VALUE / OVERRIDE always; DEFAULT only when no VALUE/OVERRIDE for provenance later
    if (
      fact.instructionType !== "VALUE" &&
      fact.instructionType !== "OVERRIDE"
    ) {
      continue;
    }
    const c = candidateFromFact(fact);
    if (!c) continue;
    const key = `${c.sourceType}:${c.instructionType ?? ""}:${c.statementIndex ?? ""}:${c.sourceLabel}:${String(c.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function mapSourceType(
  type: "EMAIL" | "XLSX" | "PDF",
  instructionType: ExtractedRequestFact["instructionType"]
): FinalFieldSource {
  if (type === "EMAIL" && instructionType === "OVERRIDE") return "EMAIL_OVERRIDE";
  if (type === "EMAIL" && instructionType === "DEFAULT") return "DEFAULT";
  if (type === "EMAIL") return "EMAIL";
  if (type === "XLSX") return "XLSX";
  if (type === "PDF") return "PDF";
  return null;
}

function valuesEqual(a: string | number, b: string | number): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-9;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function isPartSpecificEmailValue(fact: ExtractedRequestFact): boolean {
  return (
    fact.source.type === "EMAIL" &&
    fact.instructionType === "VALUE" &&
    fact.matchedDxfPartId != null &&
    fact.value != null &&
    (fact.field === "QUANTITY" ||
      fact.field === "THICKNESS" ||
      fact.field === "MATERIAL")
  );
}

function pushDifferingAsPrevious(
  field: "QUANTITY" | "THICKNESS" | "MATERIAL",
  winVal: string | number,
  facts: ExtractedRequestFact[],
  previousValues: ResolveFieldResult["previousValues"]
) {
  for (const v of facts) {
    if (v.value == null) continue;
    const val = v.value as string | number;
    if (!valuesEqual(val, winVal)) {
      previousValues.push({
        field,
        value: val,
        source: v.source.type as "EMAIL" | "XLSX" | "PDF",
      });
    }
  }
}

/**
 * Field-level precedence (strict order):
 * 1. USER_RESOLUTION (when provided)
 * 2. One clear part-specific EMAIL OVERRIDE
 * 3. One clear part-specific EMAIL VALUE (matchedDxfPartId set)
 * 4. Unambiguous XLSX/PDF document VALUE consensus
 * 5. EMAIL DEFAULT
 * 6. Missing / unresolved
 */
export function resolveCommercialField(
  facts: ExtractedRequestFact[],
  field: "QUANTITY" | "THICKNESS" | "MATERIAL",
  conflictCode: string,
  userResolution?: string | number | null
): ResolveFieldResult {
  const relevant = facts.filter((f) => f.field === field && f.value != null);
  const overrides = relevant.filter(
    (f) => f.source.type === "EMAIL" && f.instructionType === "OVERRIDE"
  );
  const partEmailValues = relevant.filter(isPartSpecificEmailValue);
  const documentValues = relevant.filter(
    (f) =>
      f.instructionType === "VALUE" &&
      (f.source.type === "XLSX" || f.source.type === "PDF")
  );
  const defaults = relevant.filter(
    (f) => f.source.type === "EMAIL" && f.instructionType === "DEFAULT"
  );

  const previousValues: ResolveFieldResult["previousValues"] = [];
  const issues: string[] = [];
  const candidates = collectFieldCandidates(facts, field);

  // 1. USER_RESOLUTION
  if (userResolution != null && userResolution !== "") {
    pushDifferingAsPrevious(field, userResolution, relevant, previousValues);
    return {
      value: userResolution,
      source: "USER_RESOLUTION",
      resolutionStatus: "USER_RESOLUTION",
      previousValues,
      issues,
      candidates,
    };
  }

  // 2. EMAIL OVERRIDE
  const overrideDistinct = uniqueValues(
    overrides.map((o) => o.value as string | number)
  );
  if (overrideDistinct.length > 1) {
    issues.push(`MULTIPLE_${field}_OVERRIDES`);
    return {
      value: null,
      source: null,
      resolutionStatus: "CONFLICT",
      previousValues,
      issues,
      candidates,
    };
  }
  if (overrideDistinct.length === 1) {
    const winVal = overrideDistinct[0]!;
    const docDistinct = uniqueValues(
      documentValues.map((v) => v.value as string | number)
    );
    pushDifferingAsPrevious(field, winVal, [...documentValues, ...partEmailValues], previousValues);
    if (docDistinct.length > 1) {
      issues.push("SOURCE_CONFLICT_RESOLVED_BY_EMAIL_OVERRIDE");
    }
    return {
      value: winVal,
      source: "EMAIL_OVERRIDE",
      resolutionStatus: "OVERRIDE",
      previousValues,
      issues,
      candidates,
    };
  }

  // 3. Part-specific EMAIL VALUE (authoritative over documents)
  // Sort by statementIndex for supersession selection
  const emailSorted = [...partEmailValues].sort((a, b) => {
    const ai = a.statementIndex ?? 0;
    const bi = b.statementIndex ?? 0;
    return ai - bi;
  });
  const emailValueDistinct = uniqueValues(
    emailSorted.map((v) => v.value as string | number)
  );

  if (emailValueDistinct.length > 1) {
    const superseding = emailSorted.filter(
      (f) => f.explicitlySupersedesPrevious === true
    );
    const supersedeDistinct = uniqueValues(
      superseding.map((f) => f.value as string | number)
    );

    // Exactly one distinct superseding value → use it
    if (supersedeDistinct.length === 1) {
      const winVal = supersedeDistinct[0]!;
      pushDifferingAsPrevious(
        field,
        winVal,
        [...documentValues, ...emailSorted],
        previousValues
      );
      return {
        value: winVal,
        source: "EMAIL",
        resolutionStatus: "EMAIL_EXPLICIT_SUPERSESSION",
        previousValues,
        issues,
        candidates,
      };
    }

    // Multiple distinct superseding values, or none → conflict
    issues.push(`MULTIPLE_EMAIL_${field}_VALUES`);
    return {
      value: null,
      source: null,
      resolutionStatus: "CONFLICT",
      previousValues,
      issues,
      candidates,
    };
  }

  if (emailValueDistinct.length === 1) {
    const winVal = emailValueDistinct[0]!;
    const docDistinct = uniqueValues(
      documentValues.map((v) => v.value as string | number)
    );
    pushDifferingAsPrevious(field, winVal, documentValues, previousValues);
    if (docDistinct.length > 1) {
      issues.push("DOCUMENT_CONFLICT_RESOLVED_BY_EMAIL");
    }
    if (emailSorted.length > 1) {
      issues.push("EMAIL_DUPLICATE_STATEMENT");
    }
    const anySupersede = emailSorted.some(
      (f) => f.explicitlySupersedesPrevious === true
    );
    return {
      value: winVal,
      source: "EMAIL",
      resolutionStatus: anySupersede
        ? "EMAIL_EXPLICIT_SUPERSESSION"
        : "EMAIL_AUTHORITATIVE",
      previousValues,
      issues,
      candidates,
    };
  }

  // 4. Document XLSX/PDF VALUE consensus (email VALUE without part ID is ignored here)
  if (documentValues.length > 0) {
    const distinct = uniqueValues(
      documentValues.map((v) => v.value as string | number)
    );
    if (distinct.length > 1) {
      issues.push(conflictCode);
      return {
        value: null,
        source: null,
        resolutionStatus: "CONFLICT",
        previousValues,
        issues,
        candidates,
      };
    }

    const winVal = distinct[0]!;
    const agreeing = candidates.filter(
      (c) =>
        c.instructionType === "VALUE" &&
        (c.sourceType === "XLSX" || c.sourceType === "PDF") &&
        valuesEqual(c.value, winVal)
    );
    const sourceTypes = distinctSourceTypes(agreeing);

    if (sourceTypes.length >= 2) {
      return {
        value: winVal,
        source: "CONSENSUS",
        resolutionStatus: "CONSENSUS",
        previousValues,
        issues,
        candidates,
      };
    }

    const win = documentValues[0]!;
    return {
      value: winVal,
      source: mapSourceType(win.source.type, win.instructionType),
      resolutionStatus: "SINGLE_SOURCE",
      previousValues,
      issues,
      candidates,
    };
  }

  // 5. EMAIL DEFAULT (lower than any explicit document VALUE)
  if (defaults.length > 0) {
    const distinct = uniqueValues(defaults.map((d) => d.value as string | number));
    if (distinct.length > 1) {
      issues.push(conflictCode);
      return {
        value: null,
        source: null,
        resolutionStatus: "CONFLICT",
        previousValues,
        issues,
        candidates,
      };
    }
    return {
      value: defaults[0]!.value as string | number,
      source: "DEFAULT",
      resolutionStatus: "SINGLE_SOURCE",
      previousValues,
      issues,
      candidates,
    };
  }

  // 6. Missing
  return {
    value: null,
    source: null,
    resolutionStatus: "MISSING",
    previousValues,
    issues,
    candidates,
  };
}

function uniqueValues(vals: Array<string | number>): Array<string | number> {
  const out: Array<string | number> = [];
  for (const v of vals) {
    if (!out.some((x) => valuesEqual(x, v))) out.push(v);
  }
  return out;
}

function groupKeyForFact(fact: ExtractedRequestFact): string | null {
  // Email overrides must attach to the DXF part they target — prefer matched ID.
  if (fact.source.type === "EMAIL" && fact.matchedDxfPartId) {
    return fact.matchedDxfPartId;
  }
  // Prefer normalized raw reference so wrong model matches (P2095→P1095)
  // still land on the customer-requested ID for REQUEST_WITHOUT_DXF.
  if (fact.rawPartReference) {
    const n = normalizePartId(fact.rawPartReference);
    if (n) return n.canonicalPartId;
  }
  if (fact.matchedDxfPartId) return fact.matchedDxfPartId;
  return null;
}

function pickDescription(facts: ExtractedRequestFact[]): string | null {
  const desc = facts.find(
    (f) =>
      f.field === "DESCRIPTION" &&
      typeof f.value === "string" &&
      f.value.trim() &&
      (f.source.type === "XLSX" || f.source.type === "PDF")
  );
  // Prefer description that does not look like hallucinated dimension prose
  const text = typeof desc?.value === "string" ? desc.value.trim() : null;
  if (!text) return null;
  if (/\bLength\s+\d+(\.\d+)?\s*m\b/i.test(text) && !/\bmm\b/i.test(text)) {
    // Keep out of main description; still available via contributingFacts
    return null;
  }
  return text;
}

function isExcluded(facts: ExtractedRequestFact[]): boolean {
  return facts.some(
    (f) =>
      (f.field === "EXCLUDE" && f.value === true) ||
      (f.instructionType === "EXCLUSION" && f.value === true)
  );
}

function sourceEvidenceFromFacts(
  facts: ExtractedRequestFact[],
  dxfFilename: string | null
): FinalIntakeMappingRow["sourceEvidence"] {
  const evidence: FinalIntakeMappingRow["sourceEvidence"] = [];
  const seen = new Set<string>();

  if (dxfFilename) {
    evidence.push({ type: "DXF", label: dxfFilename });
    seen.add(`DXF:${dxfFilename}`);
  }

  for (const f of facts) {
    const label = formatDocumentSourceLabel({
      type: f.source.type,
      fileName: f.source.fileName,
      sheetName: f.source.sheetName,
      rowNumber: f.source.rowNumber,
      cellReferences: f.source.cellReferences,
      pageNumber: f.source.pageNumber,
    });
    const key = `${f.source.type}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({ type: f.source.type, label });
  }
  return evidence;
}

function registryByCanonical(
  registry: DxfPartRegistryItem[]
): Map<string, DxfPartRegistryItem[]> {
  const map = new Map<string, DxfPartRegistryItem[]>();
  for (const item of registry) {
    if (!item.canonicalPartId) continue;
    const list = map.get(item.canonicalPartId) ?? [];
    list.push(item);
    map.set(item.canonicalPartId, list);
  }
  return map;
}

function pickRegistryItem(
  items: DxfPartRegistryItem[] | undefined
): DxfPartRegistryItem | null {
  if (!items || items.length === 0) return null;
  // Prefer identityOk without revision/duplicate issues
  const ok = items.find(
    (i) => i.identityOk && !i.revisionIssue && !i.duplicateIssue
  );
  return ok ?? items[0] ?? null;
}

/**
 * Deterministic final reconciliation — one row per canonical part ID.
 * Does not call OpenAI.
 */
export function reconcileFinalMapping(args: {
  registry: DxfPartRegistryItem[];
  acceptedFacts: ExtractedRequestFact[];
  unresolvedItems: UnresolvedRequestItem[];
  documentRows?: ExtractedDocumentRow[];
}): { rows: FinalIntakeMappingRow[]; warnings: string[] } {
  const { registry, acceptedFacts, unresolvedItems, documentRows } = args;
  const byCanonical = registryByCanonical(registry);
  const factGroups = new Map<string, ExtractedRequestFact[]>();
  const ungroupedFacts: ExtractedRequestFact[] = [];

  for (const fact of acceptedFacts) {
    const key = groupKeyForFact(fact);
    if (!key) {
      ungroupedFacts.push(fact);
      continue;
    }
    const list = factGroups.get(key) ?? [];
    list.push(fact);
    factGroups.set(key, list);
  }

  const { occurrences, warnings: occurrenceWarnings } = buildRequestOccurrences(
    documentRows ?? []
  );
  const warnings = [...occurrenceWarnings];
  const occurrencesByPart = new Map<string, RequestPartOccurrence[]>();
  for (const occ of occurrences) {
    const key = canonicalKeyForOccurrence(occ);
    if (!key) continue;
    const list = occurrencesByPart.get(key) ?? [];
    list.push(occ);
    occurrencesByPart.set(key, list);
  }

  // Global EMAIL DEFAULTs (no part id) apply to every part when that field is missing from docs.
  const globalEmailDefaults = ungroupedFacts.filter(
    (f) =>
      f.source.type === "EMAIL" &&
      f.instructionType === "DEFAULT" &&
      f.matchedDxfPartId == null &&
      f.value != null &&
      (f.field === "QUANTITY" ||
        f.field === "THICKNESS" ||
        f.field === "MATERIAL")
  );

  const rows: FinalIntakeMappingRow[] = [];
  const handledCanonical = new Set<string>();

  // All registry parts + all fact group keys + occurrence keys
  const allKeys = new Set<string>([
    ...byCanonical.keys(),
    ...factGroups.keys(),
    ...occurrencesByPart.keys(),
  ]);

  for (const partId of allKeys) {
    handledCanonical.add(partId);
    const regItems = byCanonical.get(partId);
    const reg = pickRegistryItem(regItems);
    const partFacts = factGroups.get(partId) ?? [];
    const partOccurrences = occurrencesByPart.get(partId) ?? [];
    const classification: PartOccurrenceClassification =
      classifyPartOccurrences(partOccurrences);
    const factsForResolve = filterFactsForOccurrencePolicy(
      [...partFacts, ...globalEmailDefaults],
      classification
    );
    const facts = [...partFacts, ...globalEmailDefaults];

    const hasDocumentSource = facts.some(
      (f) => f.source.type === "XLSX" || f.source.type === "PDF"
    );
    const hasEmailSource = facts.some((f) => f.source.type === "EMAIL");
    const hasDocumentAndEmail = hasDocumentSource && hasEmailSource;

    const qty = resolveCommercialField(
      factsForResolve,
      "QUANTITY",
      "QUANTITY_CONFLICT"
    );
    const thick = resolveCommercialField(
      factsForResolve,
      "THICKNESS",
      "THICKNESS_CONFLICT"
    );
    const mat = resolveCommercialField(
      factsForResolve,
      "MATERIAL",
      "MATERIAL_CONFLICT"
    );

    const issues: string[] = [
      ...qty.issues,
      ...thick.issues,
      ...mat.issues,
      ...classification.duplicateIssues,
    ];

    // Same-document repeated values: prefer duplicate issue over generic conflict
    if (classification.duplicateStatus === "REPEATED_WITH_DIFFERENT_VALUES") {
      const idx = issues.indexOf("QUANTITY_CONFLICT");
      if (idx >= 0) issues.splice(idx, 1);
      if (!issues.includes("REPEATED_PART_DIFFERENT_QUANTITY")) {
        issues.push("REPEATED_PART_DIFFERENT_QUANTITY");
      }
    }

    const previousValues = [
      ...qty.previousValues,
      ...thick.previousValues,
      ...mat.previousValues,
    ];

    const excluded = isExcluded(facts);
    const inRegistry = Boolean(reg);
    const requested = facts.length > 0 || partOccurrences.length > 0;

    // Identity / revision conflicts from registry
    if (reg) {
      if (reg.revisionIssue) {
        issues.push(DXF_ISSUE.REVISION_CONFLICT);
      }
      if (reg.duplicateIssue) {
        issues.push(DXF_ISSUE.DUPLICATE_ID);
      }
      for (const code of reg.identityIssues) {
        if (
          code === DXF_ISSUE.IDENTITY_CONFLICT ||
          code === DXF_ISSUE.MULTIPLE_LAYER_IDENTITIES ||
          code === DXF_ISSUE.NO_PART_ID
        ) {
          if (!issues.includes(code)) issues.push(code);
        }
      }
    }

    let quantityValue: number | null =
      typeof qty.value === "number" ? qty.value : null;
    let quantitySource = qty.source;
    let quantityResolution = toNumberResolution(qty);

    if (classification.duplicateStatus === "REPEATED_WITH_DIFFERENT_VALUES") {
      quantityValue = null;
      quantitySource = null;
      quantityResolution = {
        value: null,
        resolutionStatus: "CONFLICT",
        candidates: quantityResolution.candidates,
      };
    }

    const occurrenceFields =
      classification.occurrenceCount > 0
        ? {
            requestOccurrences: classification.occurrences,
            occurrenceCount: classification.occurrenceCount,
            duplicateOccurrenceCount: classification.duplicateOccurrenceCount,
            duplicateStatus: classification.duplicateStatus,
            ignoredOccurrences: classification.ignoredOccurrences,
            duplicateIssues: classification.duplicateIssues,
            displayLabel: null as string | null,
          }
        : emptyOccurrenceFields();

    const thicknessValue =
      typeof thick.value === "number" ? thick.value : null;
    const materialValue =
      typeof mat.value === "string" ? mat.value : null;

    const geometryResult = compareDocumentsToDxfGeometry({
      documentRows: documentRows ?? [],
      partId,
      dxf: {
        widthMm: reg?.widthMm ?? null,
        heightMm: reg?.heightMm ?? null,
        plateAreaMm2: reg?.plateAreaMm2 ?? null,
        netContourAreaMm2: reg?.netContourAreaMm2 ?? null,
        perimeterMm: reg?.perimeterMm ?? null,
      },
      resolved: {
        thicknessMm: thicknessValue,
        material: materialValue,
        quantity: quantityValue,
      },
    });
    for (const code of geometryResult.issues) {
      if (!issues.includes(code)) issues.push(code);
    }

    let status: FinalIntakeMappingStatus;

    if (reg?.revisionIssue) {
      status = "DXF_REVISION_CONFLICT";
    } else if (
      reg &&
      !reg.identityOk &&
      (reg.identityIssues.includes(DXF_ISSUE.IDENTITY_CONFLICT) ||
        reg.identityIssues.includes(DXF_ISSUE.MULTIPLE_LAYER_IDENTITIES))
    ) {
      status = "DXF_IDENTITY_CONFLICT";
    } else if (!inRegistry && requested) {
      status = "REQUEST_WITHOUT_DXF";
    } else if (inRegistry && !requested) {
      status = "DXF_NOT_REQUESTED";
    } else if (excluded) {
      status = "EXCLUDED";
    } else {
      const qtyOk =
        typeof quantityValue === "number" &&
        Number.isFinite(quantityValue) &&
        quantityValue > 0;
      const thickOk =
        typeof thick.value === "number" &&
        Number.isFinite(thick.value) &&
        thick.value > 0;
      const matOk =
        typeof mat.value === "string" && mat.value.trim().length > 0;
      const blocking =
        issues.includes("QUANTITY_CONFLICT") ||
        issues.includes("THICKNESS_CONFLICT") ||
        issues.includes("MATERIAL_CONFLICT") ||
        issues.includes("IDENTICAL_REQUEST_ROW_DUPLICATE") ||
        issues.includes("REPEATED_PART_DIFFERENT_QUANTITY") ||
        issues.includes("MULTIPLE_QUANTITY_OVERRIDES") ||
        issues.includes("MULTIPLE_THICKNESS_OVERRIDES") ||
        issues.includes("MULTIPLE_MATERIAL_OVERRIDES") ||
        issues.includes("MULTIPLE_EMAIL_QUANTITY_VALUES") ||
        issues.includes("MULTIPLE_EMAIL_THICKNESS_VALUES") ||
        issues.includes("MULTIPLE_EMAIL_MATERIAL_VALUES") ||
        issues.includes("MULTIPLE_OVERRIDES_QUANTITY") ||
        issues.includes("MULTIPLE_OVERRIDES_THICKNESS") ||
        issues.includes("MULTIPLE_OVERRIDES_MATERIAL") ||
        hasBlockingGeometryIssue(issues);

      if (
        inRegistry &&
        reg?.identityOk &&
        qtyOk &&
        thickOk &&
        matOk &&
        !blocking
      ) {
        status = "READY";
      } else {
        status = "NEEDS_REVIEW";
        if (
          !qtyOk &&
          !issues.includes("MISSING_QUANTITY") &&
          !issues.includes("QUANTITY_CONFLICT") &&
          !issues.includes("REPEATED_PART_DIFFERENT_QUANTITY") &&
          !issues.includes("IDENTICAL_REQUEST_ROW_DUPLICATE") &&
          !issues.includes("MULTIPLE_QUANTITY_OVERRIDES") &&
          !issues.includes("MULTIPLE_EMAIL_QUANTITY_VALUES") &&
          !issues.includes("MULTIPLE_OVERRIDES_QUANTITY")
        ) {
          issues.push("MISSING_QUANTITY");
        }
        if (
          !thickOk &&
          !issues.includes("MISSING_THICKNESS") &&
          !issues.includes("THICKNESS_CONFLICT") &&
          !issues.includes("MULTIPLE_THICKNESS_OVERRIDES") &&
          !issues.includes("MULTIPLE_EMAIL_THICKNESS_VALUES") &&
          !issues.includes("MULTIPLE_OVERRIDES_THICKNESS")
        ) {
          issues.push("MISSING_THICKNESS");
        }
        if (
          !matOk &&
          !issues.includes("MISSING_MATERIAL") &&
          !issues.includes("MATERIAL_CONFLICT") &&
          !issues.includes("MULTIPLE_MATERIAL_OVERRIDES") &&
          !issues.includes("MULTIPLE_EMAIL_MATERIAL_VALUES") &&
          !issues.includes("MULTIPLE_OVERRIDES_MATERIAL")
        ) {
          issues.push("MISSING_MATERIAL");
        }
      }
    }

    rows.push({
      status,
      partId: partId || null,
      revision: reg?.revision ?? null,
      dxfFileId: reg?.id ?? null,
      dxfFilename: reg?.filename ?? null,
      widthMm: reg?.widthMm ?? null,
      heightMm: reg?.heightMm ?? null,
      plateAreaMm2: reg?.plateAreaMm2 ?? null,
      netContourAreaMm2: reg?.netContourAreaMm2 ?? null,
      perimeterMm: reg?.perimeterMm ?? null,
      quantity: quantityValue,
      thicknessMm: thicknessValue,
      material: materialValue,
      description: pickDescription(facts),
      action: excluded ? "EXCLUDE" : requested ? "INCLUDE" : null,
      fieldSources: {
        quantity: quantitySource,
        thickness: thick.source,
        material: mat.source,
      },
      fieldCandidates: {
        quantity: toNumberResolution(qty).candidates,
        thickness: toNumberResolution(thick).candidates,
        material: toStringResolution(mat).candidates,
      },
      fieldResolutions: {
        quantity: quantityResolution,
        thickness: toNumberResolution(thick),
        material: toStringResolution(mat),
      },
      previousValues,
      hasDocumentSource,
      hasEmailSource,
      hasDocumentAndEmail,
      contributingFacts: facts,
      sourceEvidence: sourceEvidenceFromFacts(facts, reg?.filename ?? null),
      issues,
      geometryComparisons: geometryResult.comparisons,
      geometryComparisonStatus: geometryResult.geometryComparisonStatus,
      ...occurrenceFields,
    });
  }

  // Unresolved items that normalize to unknown IDs / no ID
  for (const item of unresolvedItems) {
    const n = item.rawPartReference
      ? normalizePartId(item.rawPartReference)
      : null;
    const partId = n?.canonicalPartId ?? null;
    if (partId && handledCanonical.has(partId)) continue;
    if (partId && byCanonical.has(partId)) continue;

    if (partId) handledCanonical.add(partId);

    rows.push({
      status: "REQUEST_WITHOUT_DXF",
      partId,
      revision: null,
      dxfFileId: null,
      dxfFilename: null,
      widthMm: null,
      heightMm: null,
      plateAreaMm2: null,
      netContourAreaMm2: null,
      perimeterMm: null,
      quantity: null,
      thicknessMm: null,
      material: null,
      description: item.description || null,
      action: null,
      fieldSources: {
        quantity: null,
        thickness: null,
        material: null,
      },
      fieldCandidates: {
        quantity: [],
        thickness: [],
        material: [],
      },
      fieldResolutions: {
        quantity: EMPTY_NUMBER_RESOLUTION,
        thickness: EMPTY_NUMBER_RESOLUTION,
        material: EMPTY_STRING_RESOLUTION,
      },
      previousValues: [],
      hasDocumentSource:
        item.source.type === "XLSX" || item.source.type === "PDF",
      hasEmailSource: item.source.type === "EMAIL",
      hasDocumentAndEmail: false,
      contributingFacts: [],
      sourceEvidence: [
        {
          type: item.source.type,
          label: formatDocumentSourceLabel({
            type: item.source.type,
            fileName: item.source.fileName,
            sheetName: item.source.sheetName,
            rowNumber: item.source.rowNumber,
            cellReferences: item.source.cellReferences,
            pageNumber: item.source.pageNumber,
          }),
        },
      ],
      issues: [item.reason || "REQUEST_WITHOUT_DXF"],
      geometryComparisons: [],
      geometryComparisonStatus: "NOT_AVAILABLE",
      ...emptyOccurrenceFields(),
    });
  }

  // Stable sort: READY first, then by partId
  const order: Record<FinalIntakeMappingStatus, number> = {
    READY: 0,
    NEEDS_REVIEW: 1,
    EXCLUDED: 2,
    REQUEST_WITHOUT_DXF: 3,
    DXF_NOT_REQUESTED: 4,
    DXF_IDENTITY_CONFLICT: 5,
    DXF_REVISION_CONFLICT: 6,
  };

  return {
    rows: rows.sort((a, b) => {
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return (a.partId ?? "").localeCompare(b.partId ?? "", undefined, {
        numeric: true,
      });
    }),
    warnings,
  };
}
