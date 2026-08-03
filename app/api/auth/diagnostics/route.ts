import { NextResponse } from "next/server";
import { getSupabaseAuthDiagnostics } from "@/lib/auth/diagnostics";

export const runtime = "nodejs";

/**
 * Developer-only diagnostics. Disabled in production.
 */
export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    diagnostics: getSupabaseAuthDiagnostics(),
  });
}
