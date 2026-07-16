import { normalizePartId } from "./normalizePartId";
import type {
  DocumentDxfAuditRow,
  DocumentDxfAuditSummary,
  ExtractedDocumentRow,
  ExtractedRequestFact,
  SlimRegistryItem,
  SourceDocumentResult,
  UnresolvedRequestItem,
} from "./schemas";

function registryIdSet(registry: SlimRegistryItem[]): Set<string> {
  return new Set(registry.map((r) => r.canonicalPartId));
}

function sourceLabelFromDocRow(row: ExtractedDocumentRow): string {
  const parts: string[] = [row.source.type, row.source.fileName];
  if (row.source.sheetName) parts.push(row.source.sheetName);
  if (row.source.rowNumber != null) parts.push(`row ${row.source.rowNumber}`);
  if (row.source.pageNumber != null) parts.push(`page ${row.source.pageNumber}`);
  return parts.join(" · ");
}

function sourceLabel(source: ExtractedRequestFact["source"]): string {
  const parts: string[] = [source.type];
  if (source.fileName) parts.push(source.fileName);
  if (source.sheetName) parts.push(source.sheetName);
  if (source.rowNumber != null) parts.push(`row ${source.rowNumber}`);
  if (source.pageNumber != null) parts.push(`page ${source.pageNumber}`);
  return parts.join(" · ");
}

/**
 * Formatting-only match: normalized raw reference canonical equals selected ID.
 * Does NOT allow digit/character repairs (P1084 ≠ P1094).
 */
export function isApprovedFormattingMatch(
  rawPartReference: string | null | undefined,
  matchedDxfPartId: string
): boolean {
  if (!rawPartReference?.trim()) return false;
  const normalized = normalizePartId(rawPartReference);
  if (!normalized) return false;
  return normalized.canonicalPartId === matchedDxfPartId;
}

/**
 * Drop / nullify matched IDs on expanded atomic facts that are not in the registry.
 */
export function sanitizeAcceptedFacts(
  facts: ExtractedRequestFact[],
  registry: SlimRegistryItem[]
): { acceptedFacts: ExtractedRequestFact[]; warnings: string[] } {
  const ids = registryIdSet(registry);
  const warnings: string[] = [];

  const acceptedFacts = facts.map((fact) => {
    if (fact.matchedDxfPartId == null) return fact;
    if (!ids.has(fact.matchedDxfPartId)) {
      warnings.push(
        `Rejected unknown matchedDxfPartId "${fact.matchedDxfPartId}" for raw "${fact.rawPartReference ?? ""}"`
      );
      return { ...fact, matchedDxfPartId: null };
    }
    return fact;
  });

  return { acceptedFacts, warnings };
}

function classifyDocumentRow(
  row: ExtractedDocumentRow,
  ids: Set<string>
): DocumentDxfAuditRow {
  const rawPartReference = row.rawPartReference;
  const matched = row.matchedDxfPartId;
  const normalized = rawPartReference
    ? normalizePartId(rawPartReference)
    : null;
  const label = sourceLabelFromDocRow(row);
  const commercial = {
    extractedQuantity: row.quantity,
    extractedThicknessMm: row.thicknessMm,
    extractedMaterial: row.material,
  };

  if (normalized && !ids.has(normalized.canonicalPartId)) {
    return {
      status: "REQUEST_PART_NOT_IN_DXF",
      rawPartReference,
      matchedDxfPartId: null,
      sourceType: row.source.type,
      sourceLabel: label,
      ...commercial,
      reason: `המזהה ${normalized.canonicalPartId} אינו קיים ברישום ה־DXF`,
      documentId: row.documentId,
      hasDocumentAndEmail: false,
    };
  }

  if (matched && !ids.has(matched)) {
    return {
      status: "REQUEST_PART_NOT_IN_DXF",
      rawPartReference,
      matchedDxfPartId: null,
      sourceType: row.source.type,
      sourceLabel: label,
      ...commercial,
      reason: "מודל החזיר מזהה שאינו ברישום ה־DXF",
      documentId: row.documentId,
      hasDocumentAndEmail: false,
    };
  }

  if (matched == null) {
    return {
      status: "REQUEST_PART_NOT_IN_DXF",
      rawPartReference,
      matchedDxfPartId: null,
      sourceType: row.source.type,
      sourceLabel: label,
      ...commercial,
      reason: "לא נמצאה התאמה אמינה לרישום ה־DXF",
      documentId: row.documentId,
      hasDocumentAndEmail: false,
    };
  }

  const formattingOk = isApprovedFormattingMatch(rawPartReference, matched);

  if (rawPartReference && normalized && formattingOk) {
    return {
      status: "MATCHED",
      rawPartReference,
      matchedDxfPartId: matched,
      sourceType: row.source.type,
      sourceLabel: label,
      ...commercial,
      reason: null,
      documentId: row.documentId,
      hasDocumentAndEmail: false,
    };
  }

  if (rawPartReference && normalized && !formattingOk) {
    return {
      status: "MAPPING_REQUIRES_REVIEW",
      rawPartReference,
      matchedDxfPartId: matched,
      sourceType: row.source.type,
      sourceLabel: label,
      ...commercial,
      reason: `המזהה הגולמי מתנרמל ל־${normalized.canonicalPartId} אך המודל בחר ${matched}`,
      documentId: row.documentId,
      hasDocumentAndEmail: false,
    };
  }

  return {
    status: "MAPPING_REQUIRES_REVIEW",
    rawPartReference,
    matchedDxfPartId: matched,
    sourceType: row.source.type,
    sourceLabel: label,
    ...commercial,
    reason: rawPartReference
      ? "לא ניתן לנרמל את ההפניה הגולמית לאימות דטרמיניסטי"
      : "התאמה ללא הפניה גולמית ברורה",
    documentId: row.documentId,
    hasDocumentAndEmail: false,
  };
}

/**
 * Checkpoint 4.1 — one audit row per source document row (no cross-document collapse).
 */
export function buildDocumentDxfAudit(args: {
  documentRows: ExtractedDocumentRow[];
  documentResults: SourceDocumentResult[];
  acceptedFacts: ExtractedRequestFact[];
  unresolvedItems: UnresolvedRequestItem[];
  registry: SlimRegistryItem[];
}): { rows: DocumentDxfAuditRow[]; summary: DocumentDxfAuditSummary } {
  const { documentRows, documentResults, acceptedFacts, unresolvedItems, registry } =
    args;
  const ids = registryIdSet(registry);
  const rows: DocumentDxfAuditRow[] = [];
  const referencedCanonical = new Set<string>();

  // Failed sources appear explicitly
  for (const doc of documentResults) {
    if (doc.status === "FAILED") {
      rows.push({
        status: "SOURCE_FAILED",
        rawPartReference: null,
        matchedDxfPartId: null,
        sourceType: doc.sourceType,
        sourceLabel: `${doc.sourceType} · ${doc.fileName}`,
        extractedQuantity: null,
        extractedThicknessMm: null,
        extractedMaterial: null,
        reason: doc.errorCode
          ? `חילוץ המקור נכשל (${doc.errorCode})`
          : "חילוץ המקור נכשל",
        documentId: doc.documentId,
        hasDocumentAndEmail: false,
      });
    }
  }

  // One audit row per extracted document row (XLSX and PDF both survive)
  for (const docRow of documentRows) {
    const auditRow = classifyDocumentRow(docRow, ids);
    rows.push(auditRow);
    if (auditRow.matchedDxfPartId) {
      referencedCanonical.add(auditRow.matchedDxfPartId);
    }
    if (auditRow.rawPartReference) {
      const n = normalizePartId(auditRow.rawPartReference);
      if (n && ids.has(n.canonicalPartId)) {
        referencedCanonical.add(n.canonicalPartId);
      }
    }
  }

  // Email-only facts (no document row for that part/source)
  const emailFacts = acceptedFacts.filter((f) => f.source.type === "EMAIL");
  const emailGroups = new Map<string, ExtractedRequestFact[]>();
  for (const fact of emailFacts) {
    const key =
      fact.matchedDxfPartId ||
      (fact.rawPartReference
        ? normalizePartId(fact.rawPartReference)?.canonicalPartId
        : null) ||
      fact.rawPartReference?.trim() ||
      `email-anon-${emailGroups.size}`;
    const list = emailGroups.get(key) ?? [];
    list.push(fact);
    emailGroups.set(key, list);
  }

  for (const [rawKey, facts] of emailGroups) {
    const rawPartReference =
      facts.find((f) => f.rawPartReference)?.rawPartReference ??
      (rawKey.startsWith("email-anon-") ? null : rawKey);
    const matched =
      facts.find((f) => f.matchedDxfPartId)?.matchedDxfPartId ?? null;
    const source = facts[0]!.source;
    let qty: number | null = null;
    let thick: number | null = null;
    let mat: string | null = null;
    for (const f of facts) {
      if (f.field === "QUANTITY" && typeof f.value === "number") qty = f.value;
      if (f.field === "THICKNESS" && typeof f.value === "number") thick = f.value;
      if (f.field === "MATERIAL" && typeof f.value === "string") mat = f.value;
    }

    // Skip if a document row already covers this part (email still in final reconciliation)
    const coveredByDoc = documentRows.some((r) => {
      const n = r.rawPartReference
        ? normalizePartId(r.rawPartReference)?.canonicalPartId
        : null;
      const id = r.matchedDxfPartId ?? n;
      const emailKey =
        matched ||
        (rawPartReference
          ? normalizePartId(rawPartReference)?.canonicalPartId
          : null);
      return id != null && emailKey != null && id === emailKey;
    });
    if (coveredByDoc) continue;

    const normalized = rawPartReference
      ? normalizePartId(rawPartReference)
      : null;

    if (matched && ids.has(matched)) {
      referencedCanonical.add(matched);
      const formattingOk = isApprovedFormattingMatch(rawPartReference, matched);
      rows.push({
        status: formattingOk ? "MATCHED" : "MAPPING_REQUIRES_REVIEW",
        rawPartReference,
        matchedDxfPartId: matched,
        sourceType: "EMAIL",
        sourceLabel: sourceLabel(source),
        extractedQuantity: qty,
        extractedThicknessMm: thick,
        extractedMaterial: mat,
        reason: formattingOk ? null : "התאמת מייל דורשת בדיקה",
        documentId: null,
        hasDocumentAndEmail: false,
      });
    } else if (normalized && !ids.has(normalized.canonicalPartId)) {
      rows.push({
        status: "REQUEST_PART_NOT_IN_DXF",
        rawPartReference,
        matchedDxfPartId: null,
        sourceType: "EMAIL",
        sourceLabel: sourceLabel(source),
        extractedQuantity: qty,
        extractedThicknessMm: thick,
        extractedMaterial: mat,
        reason: `המזהה ${normalized.canonicalPartId} אינו קיים ברישום ה־DXF`,
        documentId: null,
        hasDocumentAndEmail: false,
      });
    } else {
      rows.push({
        status: "REQUEST_PART_NOT_IN_DXF",
        rawPartReference,
        matchedDxfPartId: null,
        sourceType: "EMAIL",
        sourceLabel: sourceLabel(source),
        extractedQuantity: qty,
        extractedThicknessMm: thick,
        extractedMaterial: mat,
        reason: "לא נמצאה התאמה אמינה לרישום ה־DXF",
        documentId: null,
        hasDocumentAndEmail: false,
      });
    }
  }

  for (const item of unresolvedItems) {
    const already = rows.some(
      (r) =>
        r.rawPartReference === item.rawPartReference &&
        r.sourceType === item.source.type &&
        (item.source.fileName == null ||
          r.sourceLabel?.includes(item.source.fileName))
    );
    if (already) continue;

    rows.push({
      status: "REQUEST_PART_NOT_IN_DXF",
      rawPartReference: item.rawPartReference,
      matchedDxfPartId: null,
      sourceType: item.source.type,
      sourceLabel: sourceLabel(item.source),
      extractedQuantity: null,
      extractedThicknessMm: null,
      extractedMaterial: null,
      reason: item.reason || "פריט לא מזוהה מול רישום ה־DXF",
      documentId: null,
      hasDocumentAndEmail: false,
    });
  }

  for (const canonicalPartId of ids) {
    if (referencedCanonical.has(canonicalPartId)) continue;
    const item = registry.find((r) => r.canonicalPartId === canonicalPartId);
    rows.push({
      status: "DXF_NOT_REFERENCED",
      rawPartReference: null,
      matchedDxfPartId: canonicalPartId,
      sourceType: null,
      sourceLabel: item?.filename ?? null,
      extractedQuantity: null,
      extractedThicknessMm: null,
      extractedMaterial: null,
      reason: "קובץ DXF לא הוזכר במסמכי הלקוח",
      documentId: null,
      hasDocumentAndEmail: false,
    });
  }

  const summary: DocumentDxfAuditSummary = {
    customerPartsSeen: rows.filter(
      (r) =>
        r.status !== "DXF_NOT_REFERENCED" && r.status !== "SOURCE_FAILED"
    ).length,
    matchedCount: rows.filter((r) => r.status === "MATCHED").length,
    requestWithoutDxfCount: rows.filter(
      (r) => r.status === "REQUEST_PART_NOT_IN_DXF"
    ).length,
    dxfNotReferencedCount: rows.filter((r) => r.status === "DXF_NOT_REFERENCED")
      .length,
    requiresReviewCount: rows.filter(
      (r) => r.status === "MAPPING_REQUIRES_REVIEW"
    ).length,
    failedSourceCount: rows.filter((r) => r.status === "SOURCE_FAILED").length,
  };

  return { rows, summary };
}
