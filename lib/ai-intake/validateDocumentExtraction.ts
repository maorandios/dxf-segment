import type {
  ExtractedDocumentRow,
  SlimRegistryItem,
  SourceDocumentResult,
  UnresolvedRequestItem,
} from "./schemas";

function registryIdSet(registry: SlimRegistryItem[]): Set<string> {
  return new Set(registry.map((r) => r.canonicalPartId));
}

/**
 * Heuristic only: excerpt looks like a multi-field data row but commercial
 * fields are missing. Does NOT fill values from the excerpt.
 */
export function documentRowPossiblyIncomplete(
  row: ExtractedDocumentRow
): boolean {
  const excerpt = row.source.excerpt?.trim() ?? "";
  if (!excerpt) return false;

  const parts = excerpt
    .split(/[,;\t|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 3) return false;

  const numericParts = parts.filter((p) => /^\d+(\.\d+)?$/.test(p));
  if (numericParts.length < 1) return false;

  const materialLike = parts.some(
    (p) =>
      /^(S|ST|A|AH|DH|EH)\d/i.test(p) ||
      /^(S235|S275|S355|A36|ST52)/i.test(p)
  );

  if (row.quantity == null && numericParts.length >= 1) return true;
  if (row.thicknessMm == null && numericParts.length >= 2) return true;
  if (materialLike && (row.material == null || row.material.trim() === "")) {
    return true;
  }
  return false;
}

export type ValidateSingleDocumentResult = {
  rows: ExtractedDocumentRow[];
  unresolvedItems: UnresolvedRequestItem[];
  warnings: string[];
};

/**
 * Validate one source-isolated document extraction after server injected
 * authoritative documentId / sourceType / fileName.
 */
export function validateSingleDocumentExtraction(
  doc: Pick<
    SourceDocumentResult,
    | "documentId"
    | "sourceType"
    | "fileName"
    | "rows"
    | "unresolvedItems"
    | "warnings"
  >,
  registry: SlimRegistryItem[]
): ValidateSingleDocumentResult {
  const warnings = [...doc.warnings];
  const ids = registryIdSet(registry);

  const rows: ExtractedDocumentRow[] = doc.rows.map((row, index) => {
    const issues = [...row.issues];

    if (row.documentId !== doc.documentId) {
      warnings.push(
        `DOCUMENT_ID_MISMATCH index=${index} expected=${doc.documentId} got=${row.documentId}`
      );
    }
    if (row.source.fileName !== doc.fileName) {
      warnings.push(
        `FILENAME_MISMATCH index=${index} expected=${doc.fileName} got=${row.source.fileName}`
      );
    }
    if (row.source.type !== doc.sourceType) {
      warnings.push(
        `SOURCE_TYPE_MISMATCH index=${index} expected=${doc.sourceType} got=${row.source.type}`
      );
    }

    let matchedDxfPartId = row.matchedDxfPartId;
    if (matchedDxfPartId != null && !ids.has(matchedDxfPartId)) {
      warnings.push(
        `Rejected unknown matchedDxfPartId "${matchedDxfPartId}" on ${doc.fileName} row ${index}`
      );
      matchedDxfPartId = null;
    }

    const next: ExtractedDocumentRow = {
      ...row,
      documentId: doc.documentId,
      matchedDxfPartId,
      source: {
        ...row.source,
        type: doc.sourceType,
        fileName: doc.fileName,
      },
      issues,
    };

    if (documentRowPossiblyIncomplete(next)) {
      warnings.push(
        `DOCUMENT_ROW_POSSIBLY_INCOMPLETE raw=${next.rawPartReference ?? ""} file=${next.source.fileName} excerpt=${(next.source.excerpt ?? "").slice(0, 80)}`
      );
    }

    return next;
  });

  // Exact same-document location duplicates (warning only; dedupe happens earlier)
  const seenKeys = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.source.rowNumber == null && !r.source.sheetName && r.source.pageNumber == null) {
      continue;
    }
    const key = [
      r.documentId,
      r.source.sheetName ?? "",
      r.source.rowNumber ?? "",
      r.source.pageNumber ?? "",
      r.rawPartReference ?? "",
    ].join("::");
    const prev = seenKeys.get(key);
    if (prev !== undefined) {
      warnings.push(
        `DOCUMENT_ROW_DUPLICATE file=${r.source.fileName} sheet=${r.source.sheetName ?? ""} row=${r.source.rowNumber} indices=${prev},${i}`
      );
    } else {
      seenKeys.set(key, i);
    }
  }

  const unresolvedItems = doc.unresolvedItems.map((item) => ({
    ...item,
    possibleDxfPartIds: item.possibleDxfPartIds.filter((id) => ids.has(id)),
    source: {
      ...item.source,
      type: doc.sourceType,
      fileName: doc.fileName,
    },
  }));

  return { rows, unresolvedItems, warnings };
}

/**
 * Aggregate-level completeness checks across all uploaded sources.
 */
export function validateSourceCompleteness(args: {
  uploaded: Array<{ documentId: string; fileName: string; sourceType: "XLSX" | "PDF" }>;
  documents: SourceDocumentResult[];
}): string[] {
  const warnings: string[] = [];
  for (const up of args.uploaded) {
    const found = args.documents.find((d) => d.documentId === up.documentId);
    if (!found) {
      warnings.push(`MISSING_DOCUMENT_RESULT:${up.fileName}`);
      continue;
    }
    if (found.status === "SUCCESS" || found.status === "PARTIAL") {
      for (const row of found.rows) {
        if (row.documentId !== up.documentId) {
          warnings.push(`ROW_DOCUMENT_ID_DRIFT:${up.fileName}`);
        }
        if (row.source.fileName !== up.fileName) {
          warnings.push(`ROW_FILENAME_DRIFT:${up.fileName}`);
        }
        // Cross-source replacement check: PDF row must not claim XLSX identity
        if (row.source.type !== up.sourceType) {
          warnings.push(
            `ROW_SOURCE_TYPE_DRIFT:${up.fileName}:expected=${up.sourceType}:got=${row.source.type}`
          );
        }
      }
    }
  }
  return warnings;
}
