"use client";

import { useSyncExternalStore } from "react";
import {
  getAuthSession,
  isSignedIn,
  subscribeAuthSession,
  type AuthSession,
} from "./authSession";

export function useAuthSession(): AuthSession | null {
  return useSyncExternalStore(
    subscribeAuthSession,
    getAuthSession,
    getAuthSession
  );
}

export function useIsSignedIn(): boolean {
  return useSyncExternalStore(subscribeAuthSession, isSignedIn, () => false);
}
