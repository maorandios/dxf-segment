import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/auth/normalizeEmail";

function isAlreadyRegisteredError(error: {
  message?: string;
  code?: string;
  status?: number;
}): boolean {
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  return (
    error.status === 422 ||
    code.includes("already") ||
    code.includes("exists") ||
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists")
  );
}

/**
 * Ensure an allowlisted email has a confirmed auth.users row BEFORE OTP send.
 * This avoids Supabase sending a "Confirm signup" email on first login.
 * Only call after the omega_users allowlist precheck succeeds.
 */
export async function ensureConfirmedAllowlistedAuthUser(
  email: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  const admin = createSupabaseAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: true,
  });

  if (!error) return;

  if (!isAlreadyRegisteredError(error)) {
    throw error;
  }

  // Confirm a leftover unconfirmed signup from an earlier attempt.
  const { data: listed } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = listed?.users?.find(
    (u) => normalizeEmail(u.email ?? "") === normalized
  );
  if (existing && !existing.email_confirmed_at) {
    const { error: confirmError } = await admin.auth.admin.updateUserById(
      existing.id,
      { email_confirm: true }
    );
    if (confirmError) throw confirmError;
  }
}
