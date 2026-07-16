import type { ExtractedEmailFact } from "../schemas";

/** Fill required email-fact metadata for unit-test fixtures. */
export function emailFact(
  partial: Omit<
    ExtractedEmailFact,
    "factId" | "statementIndex" | "explicitlySupersedesPrevious"
  > & {
    factId?: string;
    statementIndex?: number;
    explicitlySupersedesPrevious?: boolean;
  },
  index = 1
): ExtractedEmailFact {
  const statementIndex = partial.statementIndex ?? index;
  return {
    ...partial,
    factId: partial.factId ?? `email:${statementIndex}:${partial.field}`,
    statementIndex,
    explicitlySupersedesPrevious: partial.explicitlySupersedesPrevious ?? false,
  } as ExtractedEmailFact;
}

export function emailFacts(
  facts: Array<
    Omit<
      ExtractedEmailFact,
      "factId" | "statementIndex" | "explicitlySupersedesPrevious"
    > & {
      factId?: string;
      statementIndex?: number;
      explicitlySupersedesPrevious?: boolean;
    }
  >
): ExtractedEmailFact[] {
  return facts.map((f, i) => emailFact(f, i + 1));
}
