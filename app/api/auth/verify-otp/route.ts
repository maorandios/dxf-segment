import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/auth/normalizeEmail";
import {
  loadAuthenticatedOmegaUser,
  touchLastLogin,
} from "@/lib/auth/loadOmegaUser";
import {
  AUTH_MESSAGES,
  isSixDigitOtp,
  mapOtpVerifyError,
} from "@/lib/auth/otpMessages";
import {
  recordDiagnostic,
  setDiagnosticProfile,
} from "@/lib/auth/diagnostics";

export const runtime = "nodejs";

/**
 * Verify six-digit Email OTP and establish SSR cookie session.
 * Does not return access/refresh tokens in JSON.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { email?: string; token?: string };
    const email = typeof body.email === "string" ? body.email : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!isValidEmailFormat(email)) {
      return NextResponse.json(
        { ok: false, message: "יש להזין כתובת דוא״ל תקינה" },
        { status: 400 }
      );
    }
    if (!isSixDigitOtp(token)) {
      return NextResponse.json(
        { ok: false, message: AUTH_MESSAGES.invalidOtp },
        { status: 400 }
      );
    }

    const normalized = normalizeEmail(email);
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.verifyOtp({
      email: normalized,
      token,
      type: "email",
    });

    recordDiagnostic("otpVerifyCount");

    if (error) {
      return NextResponse.json(
        { ok: false, message: mapOtpVerifyError(error) },
        { status: 400 }
      );
    }

    const profile = await loadAuthenticatedOmegaUser();
    if (!profile.ok) {
      // Deactivated / unlinked — clear session when practical.
      await supabase.auth.signOut();
      return NextResponse.json(
        { ok: false, message: profile.message },
        { status: 403 }
      );
    }

    await touchLastLogin(profile.user.email);

    setDiagnosticProfile({
      currentAuthUserId: profile.authUserId,
      linkedOmegaUserEmail: profile.user.email,
      accountStatus: profile.user.accountStatus,
      creditsBalance: profile.user.creditsBalance,
      renewalDate: profile.user.renewalDate,
    });

    return NextResponse.json({
      ok: true,
      user: profile.user,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: AUTH_MESSAGES.verifyFailed },
      { status: 500 }
    );
  }
}
