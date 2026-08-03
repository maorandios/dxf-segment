import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  toOmegaCurrentUser,
  type OmegaCurrentUser,
  type OmegaUserRow,
} from "@/lib/auth/omegaUser";
import { recordDiagnostic } from "@/lib/auth/diagnostics";

const USER_SELECT =
  "email, company_name, company_registration_number, address, phone, contact_name, account_status, credits_balance, credits_period_start, is_active, auth_user_id";

export type LoadProfileResult =
  | { ok: true; user: OmegaCurrentUser; authUserId: string }
  | {
      ok: false;
      code: "UNAUTHENTICATED" | "INACTIVE" | "NOT_LINKED";
      message: string;
    };

/**
 * Authoritative profile load: getUser() + active omega_users row.
 * Also ensures monthly credit period for permanent accounts.
 */
export async function loadAuthenticatedOmegaUser(): Promise<LoadProfileResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      message: "לא מחובר",
    };
  }

  // Ensure period before reading balance (no-op when already current).
  await supabase.rpc("ensure_current_credit_period");

  const { data: row, error: rowError } = await supabase
    .from("omega_users")
    .select(USER_SELECT)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (rowError || !row) {
    recordDiagnostic("unauthorizedProfileReadCount");
    return {
      ok: false,
      code: "NOT_LINKED",
      message: "הגישה לחשבון זה אינה פעילה",
    };
  }

  const typed = row as OmegaUserRow;
  if (!typed.is_active) {
    return {
      ok: false,
      code: "INACTIVE",
      message: "הגישה לחשבון זה אינה פעילה",
    };
  }

  return {
    ok: true,
    user: toOmegaCurrentUser(typed),
    authUserId: user.id,
  };
}

/** Update last_login_at via service role after successful OTP verify. */
export async function touchLastLogin(email: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("omega_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("email", email);
}

/** Admin precheck: active allowlisted email exists (no company data leaked). */
export async function isActiveAllowlistedEmail(
  normalizedEmail: string
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("omega_users")
    .select("email")
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.email);
}
