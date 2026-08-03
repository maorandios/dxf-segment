import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/auth/normalizeEmail";
import { isActiveAllowlistedEmail } from "@/lib/auth/loadOmegaUser";
import { ensureConfirmedAllowlistedAuthUser } from "@/lib/auth/ensureAuthUser";
import {
  AUTH_MESSAGES,
  mapOtpRequestError,
} from "@/lib/auth/otpMessages";
import { recordDiagnostic } from "@/lib/auth/diagnostics";

export const runtime = "nodejs";

/**
 * Friendly server-side email precheck + OTP send.
 *
 * Flow for allowlisted emails:
 * 1. Reject if not an active omega_users row
 * 2. Ensure a confirmed auth.users row exists (no Confirm-signup email)
 * 3. Send six-digit Email OTP only
 *
 * Authoritative allowlist also remains on the Before User Created Hook
 * for any non-admin Auth creation path.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { email?: string };
    const email = typeof body.email === "string" ? body.email : "";

    if (!isValidEmailFormat(email)) {
      return NextResponse.json(
        { ok: false, message: "יש להזין כתובת דוא״ל תקינה" },
        { status: 400 }
      );
    }

    const normalized = normalizeEmail(email);
    const allowed = await isActiveAllowlistedEmail(normalized);

    if (!allowed) {
      recordDiagnostic("unregisteredEmailRejectionCount");
      return NextResponse.json(
        { ok: false, message: AUTH_MESSAGES.unregistered },
        { status: 403 }
      );
    }

    // Create/confirm Auth user via service role so OTP is not preceded by
    // a Confirm signup email on first login.
    await ensureConfirmedAllowlistedAuthUser(normalized);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        // User already exists and is confirmed — OTP only.
        shouldCreateUser: false,
      },
    });

    recordDiagnostic("otpRequestCount");

    if (error) {
      return NextResponse.json(
        { ok: false, message: mapOtpRequestError(error) },
        { status: 400 }
      );
    }

    // Neutral success — do not leak company data.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: AUTH_MESSAGES.sendFailed },
      { status: 500 }
    );
  }
}
