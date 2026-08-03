import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Server-only — never use NEXT_PUBLIC_*."
    );
  }
  return key;
}

/**
 * Service-role admin client — server-only.
 * Never import from Client Components. Never return this client or its key.
 */
export function createSupabaseAdminClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
