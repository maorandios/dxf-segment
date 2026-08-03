/**
 * Client auth session — profile from /api/auth/me (SSR cookie session).
 * No custom auth tokens in localStorage.
 */

import type { OmegaCurrentUser } from "@/lib/auth/omegaUser";

export type AuthSession = {
  email: string;
  signedInAt: string;
  user: OmegaCurrentUser;
};

type Listener = () => void;

let session: AuthSession | null = null;
let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeAuthSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSession(): AuthSession | null {
  return session;
}

export function isSignedIn(): boolean {
  return session != null;
}

export function isAuthBootstrapped(): boolean {
  return bootstrapped;
}

export function getCurrentOmegaUser(): OmegaCurrentUser | null {
  return session?.user ?? null;
}

export function setCurrentOmegaUser(user: OmegaCurrentUser): void {
  session = {
    email: user.email,
    signedInAt: session?.signedInAt ?? new Date().toISOString(),
    user,
  };
  emit();
}

export function applyCreditsBalance(creditsBalance: number): void {
  if (!session) return;
  session = {
    ...session,
    user: { ...session.user, creditsBalance },
  };
  emit();
}

export function clearAuthSession(): void {
  session = null;
  emit();
}

/** Load profile from cookie session. Safe to call repeatedly. */
export async function refreshAuthSession(): Promise<AuthSession | null> {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) {
      session = null;
      emit();
      return null;
    }
    const json = (await res.json()) as {
      ok?: boolean;
      user?: OmegaCurrentUser;
    };
    if (!json.ok || !json.user || !json.user.isActive) {
      session = null;
      emit();
      return null;
    }
    setCurrentOmegaUser(json.user);
    return session;
  } catch {
    session = null;
    emit();
    return null;
  }
}

export function ensureAuthBootstrap(): Promise<void> {
  if (bootstrapped) return Promise.resolve();
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = refreshAuthSession()
    .catch(() => null)
    .then(() => {
      bootstrapped = true;
      emit();
    });
  return bootstrapPromise;
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Still clear local session.
  }
  session = null;
  emit();
}

/** @deprecated Stub removed — use OTP verify flow. */
export function completeMagicLinkStub(): void {
  // Intentionally no-op for compile safety of old imports during migration.
}
