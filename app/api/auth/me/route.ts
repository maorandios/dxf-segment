import { NextResponse } from "next/server";
import {
  loadAuthenticatedOmegaUser,
} from "@/lib/auth/loadOmegaUser";
import { setDiagnosticProfile } from "@/lib/auth/diagnostics";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

/** Safe profile for the authenticated session. */
export async function GET(): Promise<Response> {
  const cfg = isSupabaseConfigured();
  if (!cfg.url || !cfg.publishableKey) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHENTICATED", message: "לא מחובר" },
      { status: 401 }
    );
  }

  try {
    const profile = await loadAuthenticatedOmegaUser();
    if (!profile.ok) {
      const status =
        profile.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json(
        { ok: false, code: profile.code, message: profile.message },
        { status }
      );
    }

    setDiagnosticProfile({
      currentAuthUserId: profile.authUserId,
      linkedOmegaUserEmail: profile.user.email,
      accountStatus: profile.user.accountStatus,
      creditsBalance: profile.user.creditsBalance,
      renewalDate: profile.user.renewalDate,
    });

    return NextResponse.json(
      { ok: true, user: profile.user },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "UNAUTHENTICATED", message: "לא מחובר" },
      { status: 401 }
    );
  }
}

export async function POST(): Promise<Response> {
  // Sign out
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  return NextResponse.json({ ok: true });
}
