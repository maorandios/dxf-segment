/**
 * In-memory auth session stub (Supabase magic-link comes later).
 * Does not write quotation data — only ephemeral sign-in state.
 * No React imports — safe for shared/server modules like signedInUser.
 */

export type AuthSession = {
  email: string;
  signedInAt: string;
};

type Listener = () => void;

let session: AuthSession | null = null;
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

/** Stub: treat a submitted email as an immediate successful magic-link sign-in. */
export function completeMagicLinkStub(email: string): void {
  const trimmed = email.trim();
  if (!trimmed) return;
  session = {
    email: trimmed,
    signedInAt: new Date().toISOString(),
  };
  emit();
}

export function signOut(): void {
  if (session == null) return;
  session = null;
  emit();
}
