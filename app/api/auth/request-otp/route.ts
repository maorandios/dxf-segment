import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/auth/normalizeEmail";
import { isActiveAllowlistedEmail } from "@/lib/auth/loadOmegaUser";
import {
  AUTH_MESSAGES,
  mapOtpRequestError,
} from "@/lib/auth/otpMessages";
import { recordDiagnostic } from "@/lib/auth/diagnostics";

export const runtime = "nodejs";

/**
 * Friendly server-side email precheck + OTP send.
 * Authoritative allowlist enforcement also happens in Before User Created Hook.
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

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        // Allow Auth user creation; Before User Created Hook is authoritative.
        shouldCreateUser: true,
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
