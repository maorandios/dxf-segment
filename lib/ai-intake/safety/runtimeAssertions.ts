/**
 * Development/runtime assertions for Generic Interpreter Safety Patch v1.
 * Observational in production (console.error); throws in non-production.
 */

function fail(msg: string): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    throw new Error(`ASSERT: ${msg}`);
  }
  console.error(`[ai-intake ASSERT] ${msg}`);
}

export function assertInvariant(
  cond: unknown,
  message: string
): asserts cond {
  if (!cond) fail(message);
}

export const RuntimeAssertions = {
  geometryReasonNotRematchedAsExact(args: {
    sourceRawIdentifier: string | null;
    matchReason: string | null | undefined;
  }): void {
    if (
      args.sourceRawIdentifier == null &&
      args.matchReason === "EXACT_CANONICAL_MATCH"
    ) {
      // Suspicious rematch — warn as invariant for safety gate
      fail("GEOMETRY_REASON_REMATCHED_AS_EXACT");
    }
  },

  workingTableBlockedOnErrorInvariant(args: {
    failedErrorInvariants: string[];
    workingTableReady: boolean;
  }): void {
    if (args.failedErrorInvariants.length > 0 && args.workingTableReady) {
      fail("ERROR_INVARIANT_ALLOWED_WORKING_TABLE");
    }
  },

  unsafeNotReportedAsSuccess(args: {
    safetyStatus: string;
    finalRunStatus: string;
  }): void {
    if (
      args.safetyStatus === "UNSAFE_RESULT" &&
      (args.finalRunStatus === "SUCCESS" ||
        args.finalRunStatus === "SUCCESS_READY")
    ) {
      fail("UNSAFE_REPORTED_AS_SUCCESS");
    }
  },

  noNewPersistenceSurface(args: {
    usedIndexedDb?: boolean;
    usedLocalStorage?: boolean;
    usedSessionStorage?: boolean;
  }): void {
    if (args.usedIndexedDb) fail("INDEXEDDB_INTRODUCED");
    if (args.usedLocalStorage) fail("LOCALSTORAGE_INTRODUCED");
    if (args.usedSessionStorage) fail("SESSIONSTORAGE_INTRODUCED");
  },
};
