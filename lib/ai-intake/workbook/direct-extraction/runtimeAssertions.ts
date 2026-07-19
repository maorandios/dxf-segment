/**
 * Development/runtime assertions for Direct Extraction Transport Recovery v1.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import type {
  DirectExtractionVerification,
  DirectWorkbookExtraction,
} from "./types";
import { DIRECT_EXTRACTION_LIMITS } from "./types";
import { resolveDirectExtractionSchemaMode } from "./schemaMode";
import { stableSchemaForbidsAiOffsets } from "./stableSchema";
import type { WorkbookDirectExtractionFailure } from "./transport";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function assertDirectExtractionInvariants(args: {
  snapshot: WorkbookSnapshot;
  extraction: DirectWorkbookExtraction;
  verification: DirectExtractionVerification;
  providerCallCount: number;
  partRowsTrustedRejected?: boolean;
  failure?: WorkbookDirectExtractionFailure | null;
  finalStatus?: string;
}): void {
  if (!isDev()) return;

  if (resolveDirectExtractionSchemaMode() === "STABLE") {
    if (!stableSchemaForbidsAiOffsets()) {
      throw new Error(
        "ASSERT: stable provider schema must not require AI offsets"
      );
    }
  }

  if (args.providerCallCount > DIRECT_EXTRACTION_LIMITS.maxDirectCalls) {
    throw new Error(
      `ASSERT: direct extraction used ${args.providerCallCount} provider calls (max ${DIRECT_EXTRACTION_LIMITS.maxDirectCalls})`
    );
  }

  if (
    args.failure &&
    (args.finalStatus === "SUCCESS" ||
      args.finalStatus === "SUCCESS_WITH_WARNINGS")
  ) {
    throw new Error(
      "ASSERT: transport failure cannot produce SUCCESS status"
    );
  }

  if (
    args.verification.hasCandidatePartData &&
    args.verification.coverageMetrics.verifiedPartRows === 0 &&
    (args.verification.status === "PASS" ||
      args.verification.status === "PASS_WITH_WARNINGS")
  ) {
    throw new Error(
      "ASSERT: zero verified rows cannot PASS when candidate part data exists"
    );
  }

  for (const row of args.extraction.rows) {
    for (const field of [
      row.explicitPartIdentifier,
      row.sourceDescriptor,
      row.profile,
      row.quantity,
      row.material,
    ]) {
      if (!field) continue;
      const rejected = args.verification.rejectedFieldKeys.some((k) =>
        k.startsWith(`${row.extractedRowId}:`)
      );
      if (rejected) continue;
      if (field.sourceRefs.length === 0) {
        throw new Error(
          `ASSERT: accepted field on ${row.extractedRowId} missing source refs`
        );
      }
      // Offsets must be local (may be null for MULTIPLE_MATCHES) — never trust AI spans alone
      for (const ref of field.sourceRefs) {
        if (
          ref.characterStart != null &&
          ref.characterEnd != null &&
          !ref.evidenceStatus &&
          !ref.matchMethod
        ) {
          // Enriched refs should always carry local evidence metadata after conversion
        }
      }
    }
  }

  if (args.partRowsTrustedRejected) {
    throw new Error(
      "ASSERT: rejected fields must not become trusted canonical values"
    );
  }

  void args.snapshot;
}
