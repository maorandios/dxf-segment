"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "./env";

/**
 * Browser Supabase client — public key only.
 * Session lives in cookies via @supabase/ssr (not localStorage auth state).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
}
