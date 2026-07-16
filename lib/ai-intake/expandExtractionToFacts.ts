import type {
  ExtractedDocumentRow,
  ExtractedEmailFact,
  ExtractedRequestFact,
  AiRequestExtraction,
} from "./schemas";

function documentCellRefs(row: ExtractedDocumentRow): string[] {
  return [
    row.source.partReferenceCell,
    row.source.quantityCell,
    row.source.thicknessCell,
    row.source.materialCell,
  ].filter((c): c is string => typeof c === "string" && c.trim().length > 0);
}

/**
 * Convert one complete document row into VALUE atomic facts.
 * Does not apply email overrides.
 */
export function expandDocumentRowToFacts(
  row: ExtractedDocumentRow
): ExtractedRequestFact[] {
  const source = {
    type: row.source.type,
    fileName: row.source.fileName,
    sheetName: row.source.sheetName,
    rowNumber: row.source.rowNumber,
    cellReferences: documentCellRefs(row),
    pageNumber: row.source.pageNumber,
    excerpt: row.source.excerpt,
  };
  const base = {
    matchedDxfPartId: row.matchedDxfPartId,
    rawPartReference: row.rawPartReference,
    instructionType: "VALUE" as const,
    source,
    issues: [...row.issues],
  };

  const facts: ExtractedRequestFact[] = [];

  if (row.quantity != null) {
    facts.push({
      ...base,
      field: "QUANTITY",
      value: row.quantity,
      source: {
        ...source,
        cellReferences: row.source.quantityCell
          ? [row.source.quantityCell]
          : source.cellReferences,
      },
    });
  }
  if (row.thicknessMm != null) {
    facts.push({
      ...base,
      field: "THICKNESS",
      value: row.thicknessMm,
      source: {
        ...source,
        cellReferences: row.source.thicknessCell
          ? [row.source.thicknessCell]
          : source.cellReferences,
      },
    });
  }
  if (row.material != null && row.material.trim() !== "") {
    facts.push({
      ...base,
      field: "MATERIAL",
      value: row.material,
      source: {
        ...source,
        cellReferences: row.source.materialCell
          ? [row.source.materialCell]
          : source.cellReferences,
      },
    });
  }
  if (row.description != null && row.description.trim() !== "") {
    facts.push({
      ...base,
      field: "DESCRIPTION",
      value: row.description,
    });
  }
  if (row.action === "EXCLUDE") {
    facts.push({
      ...base,
      field: "EXCLUDE",
      value: true,
      instructionType: "EXCLUSION",
    });
  } else if (row.action === "INCLUDE") {
    facts.push({
      ...base,
      field: "INCLUDE",
      value: true,
      instructionType: "VALUE",
    });
  }

  return facts;
}

export function expandEmailFactToAtomic(
  fact: ExtractedEmailFact
): ExtractedRequestFact {
  const source = {
    type: "EMAIL" as const,
    fileName: null,
    sheetName: null,
    rowNumber: null,
    cellReferences: [] as string[],
    pageNumber: null,
    excerpt: fact.sourceExcerpt,
  };

  if (fact.field === "QUANTITY") {
    return {
      matchedDxfPartId: fact.matchedDxfPartId,
      rawPartReference: fact.rawPartReference,
      field: "QUANTITY",
      value: fact.value,
      instructionType: fact.instructionType,
      source,
      issues: [],
    };
  }
  if (fact.field === "THICKNESS") {
    return {
      matchedDxfPartId: fact.matchedDxfPartId,
      rawPartReference: fact.rawPartReference,
      field: "THICKNESS",
      value: fact.value,
      instructionType: fact.instructionType,
      source,
      issues: [],
    };
  }
  if (fact.field === "MATERIAL") {
    return {
      matchedDxfPartId: fact.matchedDxfPartId,
      rawPartReference: fact.rawPartReference,
      field: "MATERIAL",
      value: fact.value,
      instructionType: fact.instructionType,
      source,
      issues: [],
    };
  }
  if (fact.field === "INCLUDE") {
    return {
      matchedDxfPartId: fact.matchedDxfPartId,
      rawPartReference: fact.rawPartReference,
      field: "INCLUDE",
      value: fact.value,
      instructionType: fact.instructionType,
      source,
      issues: [],
    };
  }
  return {
    matchedDxfPartId: fact.matchedDxfPartId,
    rawPartReference: fact.rawPartReference,
    field: "EXCLUDE",
    value: fact.value,
    instructionType: fact.instructionType,
    source,
    issues: [],
  };
}

/**
 * Expand document rows then append email facts — no merging.
 */
export function expandExtractionToFacts(
  extraction: AiRequestExtraction
): ExtractedRequestFact[] {
  const fromDocs = extraction.documentRows.flatMap(expandDocumentRowToFacts);
  const fromEmail = extraction.emailFacts.map(expandEmailFactToAtomic);
  return [...fromDocs, ...fromEmail];
}
