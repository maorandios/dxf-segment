"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureAuthBootstrap,
  getAuthSession,
  getCurrentOmegaUser,
  isAuthBootstrapped,
  isSignedIn,
  subscribeAuthSession,
  type AuthSession,
} from "./authSession";
import type { OmegaCurrentUser } from "@/lib/auth/omegaUser";

export function useAuthSession(): AuthSession | null {
  useEffect(() => {
    void ensureAuthBootstrap();
  }, []);
  return useSyncExternalStore(
    subscribeAuthSession,
    getAuthSession,
    () => null
  );
}

export function useAuthBootstrapped(): boolean {
  useEffect(() => {
    void ensureAuthBootstrap();
  }, []);
  return useSyncExternalStore(
    subscribeAuthSession,
    isAuthBootstrapped,
    () => false
  );
}

export function useIsSignedIn(): boolean {
  useEffect(() => {
    void ensureAuthBootstrap();
  }, []);
  return useSyncExternalStore(subscribeAuthSession, isSignedIn, () => false);
}

export function useOmegaCurrentUser(): OmegaCurrentUser | null {
  useEffect(() => {
    void ensureAuthBootstrap();
  }, []);
  return useSyncExternalStore(
    subscribeAuthSession,
    getCurrentOmegaUser,
    () => null
  );
}
