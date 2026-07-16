/**
 * Deterministic supersession language detection for email excerpts.
 * Does NOT treat order words (בהמשך / לאחר מכן / בנוסף / וגם) as replacement.
 */
export function detectExplicitSupersession(excerpt: string): boolean {
  const text = String(excerpt ?? "").trim();
  if (!text) return false;

  const patterns: RegExp[] = [
    /במקום\s+\d+/u,
    /במקום\s+הכמות/u,
    /התעלם\s+מהכמות/u,
    /התעלם\s+מהנתון/u,
    /עודכנה\s+מ[־\-]?\s*\d+\s*ל[־\-]?\s*\d+/u,
    /עודכן\s+מ[־\-]?\s*\d+\s*ל[־\-]?\s*\d+/u,
    /הכמות\s+עודכנה/u,
    /הכמות\s+הסופית/u,
    /הנתון\s+האחרון\s+והמחייב/u,
    /הנתון\s+המחייב/u,
    /לא\s+\d+\s+אלא\s+\d+/u,
    /\binstead\s+of\b/i,
    /\bupdated\s+from\b/i,
    /\bfinal\s+quantity\b/i,
    /\breplaces?\b/i,
    /\bignore\s+the\s+previous\b/i,
  ];

  return patterns.some((re) => re.test(text));
}

/**
 * Normalize OpenAI email facts: stable ids, 1-based statementIndex order,
 * and OR in deterministic supersession from excerpt language.
 */
export function normalizeEmailFacts(
  facts: Array<{
    factId?: string | null;
    statementIndex?: number | null;
    matchedDxfPartId: string | null;
    rawPartReference: string | null;
    field: string;
    value: string | number | boolean;
    instructionType: string;
    explicitlySupersedesPrevious?: boolean;
    sourceExcerpt: string;
  }>
): import("./schemas").ExtractedEmailFact[] {
  return facts.map((fact, index) => {
    const statementIndex =
      typeof fact.statementIndex === "number" && fact.statementIndex > 0
        ? fact.statementIndex
        : index + 1;
    const excerpt = fact.sourceExcerpt ?? "";
    const supersedes =
      Boolean(fact.explicitlySupersedesPrevious) ||
      detectExplicitSupersession(excerpt) ||
      fact.instructionType === "OVERRIDE";

    const base = {
      factId: fact.factId?.trim() || `email:${statementIndex}:${fact.field}`,
      statementIndex,
      matchedDxfPartId: fact.matchedDxfPartId,
      rawPartReference: fact.rawPartReference,
      explicitlySupersedesPrevious: supersedes,
      sourceExcerpt: excerpt,
    };

    if (fact.field === "QUANTITY") {
      return {
        ...base,
        field: "QUANTITY" as const,
        value: fact.value as number,
        instructionType: fact.instructionType as "VALUE" | "DEFAULT" | "OVERRIDE",
      };
    }
    if (fact.field === "THICKNESS") {
      return {
        ...base,
        field: "THICKNESS" as const,
        value: fact.value as number,
        instructionType: fact.instructionType as "VALUE" | "DEFAULT" | "OVERRIDE",
      };
    }
    if (fact.field === "MATERIAL") {
      return {
        ...base,
        field: "MATERIAL" as const,
        value: fact.value as string,
        instructionType: fact.instructionType as "VALUE" | "DEFAULT" | "OVERRIDE",
      };
    }
    if (fact.field === "INCLUDE") {
      return {
        ...base,
        field: "INCLUDE" as const,
        value: fact.value as boolean,
        instructionType: fact.instructionType as "VALUE" | "EXCLUSION",
      };
    }
    return {
      ...base,
      field: "EXCLUDE" as const,
      value: fact.value as boolean,
      instructionType: fact.instructionType as "VALUE" | "EXCLUSION",
    };
  });
}
