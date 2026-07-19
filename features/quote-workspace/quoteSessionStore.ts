/**
 * In-memory Quote Session store (tab-lifetime only).
 * No localStorage / sessionStorage / IndexedDB / persist middleware.
 */

import {
  applyReviewDecision,
  type ApplyReviewDecisionInput,
  type IntakeReviewSession,
} from "@/lib/ai-intake/review";
import {
  canCreateQuote,
  normalizeQuoteName,
} from "./quoteDetailsValidation";
import { fingerprintFile } from "./fingerprintFile";
import {
  classifyQuoteSourceKind,
  extensionOf,
  isSupportedQuoteSourceKind,
} from "./sourceClassify";
import { isValidReviewSession } from "./table/quoteTableSelectors";
import {
  QUOTE_SESSION_SCHEMA_VERSION,
  defaultQuoteReviewUi,
  type QuoteAnalysisState,
  type QuoteDetails,
  type QuoteReviewUiState,
  type QuoteSession,
  type QuoteSessionStoreState,
  type QuoteSource,
  type QuoteTableFilter,
  type QuoteTableSortKey,
  type QuoteWorkspaceStep,
} from "./types";
import { validateQuoteSession } from "./quoteSessionValidation";

type Listener = () => void;

let state: QuoteSessionStoreState = { session: null };
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function touch(session: QuoteSession): QuoteSession {
  return { ...session, updatedAt: nowIso() };
}

function emptyAnalysis(): QuoteAnalysisState {
  return {
    analysisRunId: newId(),
    startedAt: null,
    completedAt: null,
    result: null,
    reviewSession: null,
    dxfRegistry: null,
    error: null,
    progressLabel: null,
    isStale: false,
    developerDebug: null,
  };
}

function revokeSourceUrls(sources: QuoteSource[]): void {
  for (const s of sources) {
    if (s.objectUrl) {
      try {
        URL.revokeObjectURL(s.objectUrl);
      } catch {
        /* ignore */
      }
    }
  }
}

function setSession(session: QuoteSession | null): void {
  if (session) {
    validateQuoteSession(session);
  }
  state = { session };
  emit();
}

function replaceSources(
  session: QuoteSession,
  sources: QuoteSource[]
): QuoteSession {
  const supported = sources.filter(
    (s) => s.status === "READY" || s.status === "PROCESSED"
  );
  const nextStatus =
    session.status === "PROCESSING" ||
    session.status === "ANALYSIS_COMPLETE" ||
    session.status === "ANALYSIS_FAILED"
      ? session.status
      : supported.length > 0
        ? "FILES_READY"
        : "AWAITING_FILES";
  return touch({
    ...session,
    sources,
    status: nextStatus,
  });
}

/** Preserve Review Session when sources change; mark table stale. */
function withSourceChange(
  session: QuoteSession,
  sources: QuoteSource[]
): QuoteSession {
  const hasReview = session.analysis.reviewSession != null;
  if (hasReview) {
    return replaceSources(
      {
        ...session,
        analysis: {
          ...session.analysis,
          isStale: true,
        },
      },
      sources
    );
  }
  return replaceSources(
    {
      ...session,
      analysis: emptyAnalysis(),
      reviewUi: defaultQuoteReviewUi(),
    },
    sources
  );
}

export function getQuoteSessionState(): QuoteSessionStoreState {
  return state;
}

export function subscribeQuoteSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper — replace store without touching browser storage APIs. */
export function __resetQuoteSessionStoreForTests(): void {
  if (state.session) {
    revokeSourceUrls(state.session.sources);
  }
  state = { session: null };
  emit();
}

export const quoteSessionActions = {
  createQuote(details: QuoteDetails): QuoteSession {
    const projectName = normalizeQuoteName(details.projectName);
    const customerName = normalizeQuoteName(details.customerName);
    if (!canCreateQuote({ projectName, customerName })) {
      throw new Error("Invalid quote details");
    }
    const createdAt = nowIso();
    const session: QuoteSession = {
      schemaVersion: QUOTE_SESSION_SCHEMA_VERSION,
      quoteId: newId(),
      details: { projectName, customerName },
      status: "AWAITING_FILES",
      currentStep: "FILES",
      sources: [],
      analysis: emptyAnalysis(),
      reviewUi: defaultQuoteReviewUi(),
      createdAt,
      updatedAt: createdAt,
    };
    setSession(session);
    return session;
  },

  updateQuoteDetails(details: QuoteDetails): void {
    const session = state.session;
    if (!session) return;
    const projectName = normalizeQuoteName(details.projectName);
    const customerName = normalizeQuoteName(details.customerName);
    if (!canCreateQuote({ projectName, customerName })) {
      throw new Error("Invalid quote details");
    }
    setSession(
      touch({
        ...session,
        details: { projectName, customerName },
      })
    );
  },

  goToDetailsStep(): void {
    const session = state.session;
    if (!session) return;
    if (session.status === "PROCESSING") return;
    setSession(
      touch({
        ...session,
        currentStep: "DETAILS",
      })
    );
  },

  goToFilesStep(): void {
    const session = state.session;
    if (!session) return;
    if (session.status === "PROCESSING") return;

    const remappedSources = session.sources.map((s) =>
      s.status === "PROCESSING" ? { ...s, status: "READY" as const } : s
    );
    const hasReady = remappedSources.some((s) => s.status === "READY");
    const hasProcessed = remappedSources.some(
      (s) => s.status === "PROCESSED"
    );

    let nextStatus = session.status;
    if (session.status === "ANALYSIS_FAILED") {
      nextStatus = hasReady || hasProcessed ? "FILES_READY" : "AWAITING_FILES";
    } else if (
      session.status !== "ANALYSIS_COMPLETE"
    ) {
      nextStatus = hasReady ? "FILES_READY" : "AWAITING_FILES";
    }

    setSession(
      touch({
        ...session,
        currentStep: "FILES",
        status: nextStatus,
        sources: remappedSources,
        analysis:
          session.status === "ANALYSIS_FAILED"
            ? {
                ...session.analysis,
                error: null,
                progressLabel: null,
              }
            : session.analysis,
      })
    );
  },

  /**
   * Open Working Quote Table after successful analysis.
   * Requires a valid Review Session attached to the quote.
   */
  goToTable(): boolean {
    const session = state.session;
    if (!session || session.status !== "ANALYSIS_COMPLETE") return false;
    const review = session.analysis.reviewSession;
    if (!isValidReviewSession(review)) {
      return false;
    }
    setSession(
      touch({
        ...session,
        currentStep: "TABLE",
        analysis: {
          ...session.analysis,
          reviewSession: review,
        },
        reviewUi: {
          ...session.reviewUi,
          selectedRowId: session.reviewUi.selectedRowId,
        },
      })
    );
    return true;
  },

  /** @deprecated use goToTable */
  goToTablePlaceholder(): boolean {
    return quoteSessionActions.goToTable();
  },

  async addFiles(files: File[]): Promise<void> {
    const session = state.session;
    if (!session) return;
    if (session.status === "PROCESSING") return;

    const next = [...session.sources];
    for (const file of files) {
      const kind = classifyQuoteSourceKind(file.name);
      const extension = extensionOf(file.name);
      const fingerprint = await fingerprintFile(file);

      if (fingerprint) {
        const dup = next.find(
          (s) => s.fingerprint === fingerprint && s.status !== "DUPLICATE"
        );
        if (dup) {
          next.push({
            sourceId: newId(),
            file,
            fileName: file.name,
            sizeBytes: file.size,
            mimeType: file.type || "application/octet-stream",
            extension,
            kind,
            status: "DUPLICATE",
            blockingReason: "קובץ זהה כבר נוסף לרשימה",
            fingerprint,
            objectUrl: null,
            addedAt: nowIso(),
          });
          continue;
        }
      }

      const supported = isSupportedQuoteSourceKind(kind);
      next.push({
        sourceId: newId(),
        file,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        extension,
        kind,
        status: supported ? "READY" : "UNSUPPORTED",
        blockingReason: supported ? null : "סוג קובץ לא נתמך",
        fingerprint,
        objectUrl: null,
        addedAt: nowIso(),
      });
    }

    setSession(withSourceChange(session, next));
  },

  removeSource(sourceId: string): void {
    const session = state.session;
    if (!session) return;
    if (session.status === "PROCESSING") return;
    const victim = session.sources.find((s) => s.sourceId === sourceId);
    if (victim?.objectUrl) {
      try {
        URL.revokeObjectURL(victim.objectUrl);
      } catch {
        /* ignore */
      }
    }
    const next = session.sources.filter((s) => s.sourceId !== sourceId);
    setSession(withSourceChange(session, next));
  },

  clearSources(): void {
    const session = state.session;
    if (!session) return;
    if (session.status === "PROCESSING") return;
    revokeSourceUrls(session.sources);
    setSession(withSourceChange(session, []));
  },

  startAnalysis(progressLabel?: string | null): void {
    const session = state.session;
    if (!session) return;
    const ready = session.sources.filter((s) => s.status === "READY");
    if (ready.length === 0) {
      throw new Error("No supported sources");
    }
    setSession(
      touch({
        ...session,
        status: "PROCESSING",
        currentStep: "PROCESSING",
        sources: session.sources.map((s) =>
          s.status === "READY" ? { ...s, status: "PROCESSING" as const } : s
        ),
        analysis: {
          ...emptyAnalysis(),
          startedAt: nowIso(),
          progressLabel: progressLabel ?? "קורא את הקבצים",
        },
        reviewUi: defaultQuoteReviewUi(),
      })
    );
  },

  setAnalysisProgress(label: string): void {
    const session = state.session;
    if (!session || session.status !== "PROCESSING") return;
    setSession(
      touch({
        ...session,
        analysis: {
          ...session.analysis,
          progressLabel: label,
        },
      })
    );
  },

  completeAnalysis(args: {
    result: unknown;
    reviewSession?: IntakeReviewSession | null;
    dxfRegistry?: unknown | null;
    developerDebug?: unknown | null;
  }): void {
    const session = state.session;
    if (!session) return;
    let frozenResult: unknown = args.result;
    try {
      frozenResult = Object.freeze(structuredClone(args.result));
    } catch {
      frozenResult = Object.freeze(args.result as object);
    }
    const review =
      args.reviewSession && isValidReviewSession(args.reviewSession)
        ? args.reviewSession
        : null;
    let frozenDebug: unknown = args.developerDebug ?? null;
    if (frozenDebug != null) {
      try {
        frozenDebug = Object.freeze(structuredClone(frozenDebug));
      } catch {
        frozenDebug = Object.freeze(frozenDebug as object);
      }
    }
    setSession(
      touch({
        ...session,
        status: "ANALYSIS_COMPLETE",
        currentStep: "COMPLETE",
        sources: session.sources.map((s) =>
          s.status === "PROCESSING"
            ? { ...s, status: "PROCESSED" as const }
            : s
        ),
        analysis: {
          analysisRunId: session.analysis.analysisRunId,
          startedAt: session.analysis.startedAt,
          completedAt: nowIso(),
          result: frozenResult,
          reviewSession: review,
          dxfRegistry: args.dxfRegistry ?? null,
          error: null,
          progressLabel: null,
          isStale: false,
          developerDebug: frozenDebug,
        },
        reviewUi: defaultQuoteReviewUi(),
      })
    );
  },

  failAnalysis(error: string, developerDebug?: unknown | null): void {
    const session = state.session;
    if (!session) return;
    let frozenDebug: unknown = developerDebug ?? session.analysis.developerDebug;
    if (frozenDebug != null) {
      try {
        frozenDebug = Object.freeze(structuredClone(frozenDebug));
      } catch {
        frozenDebug = Object.freeze(frozenDebug as object);
      }
    }
    setSession(
      touch({
        ...session,
        status: "ANALYSIS_FAILED",
        currentStep: "FILES",
        sources: session.sources.map((s) =>
          s.status === "PROCESSING"
            ? { ...s, status: "READY" as const }
            : s
        ),
        analysis: {
          ...session.analysis,
          completedAt: nowIso(),
          error,
          progressLabel: null,
          result: null,
          reviewSession: null,
          dxfRegistry: session.analysis.dxfRegistry,
          isStale: false,
          developerDebug: frozenDebug,
        },
        reviewUi: defaultQuoteReviewUi(),
      })
    );
  },

  prepareReanalyze(): void {
    const session = state.session;
    if (!session) return;
    if (session.status === "PROCESSING") return;
    const sources = session.sources.map((s) =>
      s.status === "PROCESSED" || s.status === "PROCESSING"
        ? { ...s, status: "READY" as const }
        : s
    );
    const hasReady = sources.some((s) => s.status === "READY");
    setSession(
      touch({
        ...session,
        sources,
        status: hasReady ? "FILES_READY" : "AWAITING_FILES",
        currentStep: "FILES",
        analysis: emptyAnalysis(),
        reviewUi: defaultQuoteReviewUi(),
      })
    );
  },

  /** Apply a Review decision; updates the authoritative Review Session in memory. */
  applyTableDecision(input: ApplyReviewDecisionInput): void {
    const session = state.session;
    if (!session?.analysis.reviewSession) return;
    const nextReview = applyReviewDecision(
      session.analysis.reviewSession,
      input
    );
    setSession(
      touch({
        ...session,
        analysis: {
          ...session.analysis,
          reviewSession: nextReview,
        },
      })
    );
  },

  setTableFilter(filter: QuoteTableFilter): void {
    const session = state.session;
    if (!session) return;
    setSession(
      touch({
        ...session,
        reviewUi: { ...session.reviewUi, activeFilter: filter },
      })
    );
  },

  setTableSearch(query: string): void {
    const session = state.session;
    if (!session) return;
    setSession(
      touch({
        ...session,
        reviewUi: { ...session.reviewUi, searchQuery: query },
      })
    );
  },

  clearTableFilters(): void {
    const session = state.session;
    if (!session) return;
    setSession(
      touch({
        ...session,
        reviewUi: {
          ...session.reviewUi,
          activeFilter: "ALL",
          searchQuery: "",
          sortKey: null,
          sortDir: "asc",
        },
      })
    );
  },

  setTableSort(key: QuoteTableSortKey | null, dir?: "asc" | "desc"): void {
    const session = state.session;
    if (!session) return;
    let nextDir = dir ?? "asc";
    let nextKey = key;
    if (
      key != null &&
      session.reviewUi.sortKey === key &&
      dir == null
    ) {
      nextDir = session.reviewUi.sortDir === "asc" ? "desc" : "asc";
    }
    if (key == null) {
      nextKey = null;
      nextDir = "asc";
    }
    setSession(
      touch({
        ...session,
        reviewUi: {
          ...session.reviewUi,
          sortKey: nextKey,
          sortDir: nextDir,
        },
      })
    );
  },

  selectTableRow(rowId: string | null): void {
    const session = state.session;
    if (!session) return;
    setSession(
      touch({
        ...session,
        reviewUi: { ...session.reviewUi, selectedRowId: rowId },
      })
    );
  },

  patchReviewUi(patch: Partial<QuoteReviewUiState>): void {
    const session = state.session;
    if (!session) return;
    setSession(
      touch({
        ...session,
        reviewUi: { ...session.reviewUi, ...patch },
      })
    );
  },

  resetQuoteSession(): void {
    if (state.session) {
      revokeSourceUrls(state.session.sources);
    }
    setSession(null);
  },
};

export type QuoteSessionActions = typeof quoteSessionActions;

/** Assert no persist adapter is wired (dev/test). */
export function assertQuoteSessionHasNoPersistAdapter(): void {
  const s = state as { persist?: unknown; _persist?: unknown };
  if (s.persist != null || s._persist != null) {
    throw new Error("Quote session must not use a persist adapter");
  }
}

export function setQuoteCurrentStep(step: QuoteWorkspaceStep): void {
  const session = state.session;
  if (!session) return;
  setSession(touch({ ...session, currentStep: step }));
}
