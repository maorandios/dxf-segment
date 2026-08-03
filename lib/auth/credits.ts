import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordDiagnostic } from "@/lib/auth/diagnostics";

export type ConsumeCreditResult =
  | {
      ok: true;
      creditsBalance: number;
      duplicate: boolean;
      idempotencyKey: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      creditsBalance?: number;
    };

/**
 * Atomic credit consumption immediately before paid AI analysis.
 * Idempotent on p_idempotency_key.
 */
export async function consumeQuotationCredit(
  idempotencyKey: string
): Promise<ConsumeCreditResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_quotation_credit", {
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    return {
      ok: false,
      code: "RPC_ERROR",
      message: "אין מספיק קרדיטים ליצירת הצעת מחיר חדשה",
    };
  }

  const result = data as {
    ok?: boolean;
    duplicate?: boolean;
    credits_balance?: number;
    code?: string;
    message?: string;
  };

  if (!result?.ok) {
    return {
      ok: false,
      code: result?.code ?? "INSUFFICIENT_CREDITS",
      message:
        result?.message ??
        "אין מספיק קרדיטים ליצירת הצעת מחיר חדשה",
      creditsBalance: result?.credits_balance,
    };
  }

  if (result.duplicate) {
    recordDiagnostic("duplicateCreditConsumePreventedCount");
  } else {
    recordDiagnostic("quotationCreditConsumeCount");
  }

  return {
    ok: true,
    creditsBalance: result.credits_balance ?? 0,
    duplicate: Boolean(result.duplicate),
    idempotencyKey,
  };
}

/**
 * Refund when the provider request definitively failed before a usable result.
 * Preferred policy: consume before call → refund only on pre-result failure.
 */
export async function refundQuotationCredit(
  consumeIdempotencyKey: string,
  reason = "PROVIDER_FAILED_BEFORE_RESULT"
): Promise<{ ok: boolean; creditsBalance?: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("refund_quotation_credit", {
    p_consume_idempotency_key: consumeIdempotencyKey,
    p_reason: reason,
  });
  if (error) return { ok: false };
  const result = data as {
    ok?: boolean;
    credits_balance?: number;
  };
  return {
    ok: Boolean(result?.ok),
    creditsBalance: result?.credits_balance,
  };
}
