import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toOmegaCurrentUser, type OmegaUserRow } from "@/lib/auth/omegaUser";
import { loadAuthenticatedOmegaUser } from "@/lib/auth/loadOmegaUser";
import { setDiagnosticProfile } from "@/lib/auth/diagnostics";

export const runtime = "nodejs";

/**
 * Controlled company-profile update — permitted fields only.
 * Login email is identity and is never changed here.
 */
export async function POST(req: Request): Promise<Response> {
  const profile = await loadAuthenticatedOmegaUser();
  if (!profile.ok) {
    return NextResponse.json(
      { ok: false, message: profile.message },
      { status: profile.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const body = (await req.json()) as {
    companyName?: string;
    companyRegistrationNumber?: string;
    address?: string;
    phone?: string;
    contactName?: string;
  };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_omega_company_profile", {
    p_company_name: typeof body.companyName === "string" ? body.companyName : "",
    p_company_registration_number:
      typeof body.companyRegistrationNumber === "string"
        ? body.companyRegistrationNumber
        : "",
    p_address: typeof body.address === "string" ? body.address : "",
    p_phone: typeof body.phone === "string" ? body.phone : "",
    p_contact_name: typeof body.contactName === "string" ? body.contactName : "",
  });

  if (error || !data) {
    return NextResponse.json(
      { ok: false, message: "לא ניתן לשמור את פרטי החברה" },
      { status: 400 }
    );
  }

  const user = toOmegaCurrentUser(data as OmegaUserRow);
  setDiagnosticProfile({
    linkedOmegaUserEmail: user.email,
    accountStatus: user.accountStatus,
    creditsBalance: user.creditsBalance,
    renewalDate: user.renewalDate,
  });

  return NextResponse.json({ ok: true, user });
}
