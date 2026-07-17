"use client";

import { useSyncExternalStore } from "react";
import {
  getQuoteSessionState,
  quoteSessionActions,
  subscribeQuoteSession,
} from "./quoteSessionStore";
import type { QuoteSession } from "./types";

function getServerSnapshot() {
  return { session: null as QuoteSession | null };
}

export function useQuoteSession(): {
  session: QuoteSession | null;
  actions: typeof quoteSessionActions;
} {
  const state = useSyncExternalStore(
    subscribeQuoteSession,
    getQuoteSessionState,
    getServerSnapshot
  );

  return {
    session: state.session,
    actions: quoteSessionActions,
  };
}

export function useQuoteSessionActions(): typeof quoteSessionActions {
  return quoteSessionActions;
}
