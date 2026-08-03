/**
 * Public Supabase environment boundary (safe for browser + server).
 * Prefer NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; fall back to legacy anon key.
 * Service-role key lives only in lib/supabase/admin.ts (server-only).
 */

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getSupabaseUrl(): string {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Set it in Vercel / .env.local (e.g. https://eebudcxiknuanxmbqhxm.supabase.co)."
    );
  }
  return url;
}

/** Public browser key — publishable preferred, anon as compatibility fallback. */
export function getSupabasePublishableKey(): string {
  const publishable = readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (publishable) return publishable;
  const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (anon) return anon;
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)."
  );
}

export function isSupabaseConfigured(): {
  url: boolean;
  publishableKey: boolean;
  serviceRole: boolean;
} {
  return {
    url: Boolean(readEnv("NEXT_PUBLIC_SUPABASE_URL")),
    publishableKey: Boolean(
      readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
        readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    ),
    serviceRole: Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY")),
  };
}

/** Soft check used by diagnostics — does not throw. */
export function peekSupabaseEnv(): {
  supabaseUrlConfigured: boolean;
  publishableKeyConfigured: boolean;
  serviceRoleAvailableServerSide: boolean;
  serviceRoleExposedClientSide: boolean;
} {
  const exposedClientSide =
    typeof process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY === "string" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.trim());

  return {
    supabaseUrlConfigured: Boolean(readEnv("NEXT_PUBLIC_SUPABASE_URL")),
    publishableKeyConfigured: Boolean(
      readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
        readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    ),
    serviceRoleAvailableServerSide: Boolean(
      readEnv("SUPABASE_SERVICE_ROLE_KEY")
    ),
    serviceRoleExposedClientSide: exposedClientSide,
  };
}
