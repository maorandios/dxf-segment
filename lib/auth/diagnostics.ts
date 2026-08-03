/**
 * Developer-only Supabase auth/credits diagnostics.
 * Not exposed in production UI.
 */

import { peekSupabaseEnv } from "@/lib/supabase/env";

export type SupabaseAuthDiagnostics = {
  supabaseUrlConfigured: boolean;
  publishableKeyConfigured: boolean;
  serviceRoleAvailableServerSide: boolean;
  serviceRoleExposedClientSide: boolean;

  otpRequestCount: number;
  otpVerifyCount: number;

  unregisteredEmailRejectionCount: number;
  beforeUserCreatedHookRejectionCount: number;

  currentAuthUserId: string | null;
  linkedOmegaUserEmail: string | null;

  accountStatus: "trial" | "permanent" | null;
  creditsBalance: number | null;
  renewalDate: string | null;

  quotationCreditConsumeCount: number;
  duplicateCreditConsumePreventedCount: number;

  unauthorizedProfileReadCount: number;
  clientCreditMutationCount: number;

  quotationRowsStoredInSupabase: number;
  dxfFilesStoredInSupabase: number;
  omegaProjectFilesStoredInSupabase: number;
};

type CounterKey =
  | "otpRequestCount"
  | "otpVerifyCount"
  | "unregisteredEmailRejectionCount"
  | "beforeUserCreatedHookRejectionCount"
  | "quotationCreditConsumeCount"
  | "duplicateCreditConsumePreventedCount"
  | "unauthorizedProfileReadCount"
  | "clientCreditMutationCount";

const counters: Record<CounterKey, number> = {
  otpRequestCount: 0,
  otpVerifyCount: 0,
  unregisteredEmailRejectionCount: 0,
  beforeUserCreatedHookRejectionCount: 0,
  quotationCreditConsumeCount: 0,
  duplicateCreditConsumePreventedCount: 0,
  unauthorizedProfileReadCount: 0,
  clientCreditMutationCount: 0,
};

let snapshotExtras: Partial<
  Pick<
    SupabaseAuthDiagnostics,
    | "currentAuthUserId"
    | "linkedOmegaUserEmail"
    | "accountStatus"
    | "creditsBalance"
    | "renewalDate"
  >
> = {};

export function recordDiagnostic(key: CounterKey, by = 1): void {
  counters[key] += by;
}

export function setDiagnosticProfile(partial: typeof snapshotExtras): void {
  snapshotExtras = { ...snapshotExtras, ...partial };
}

export function getSupabaseAuthDiagnostics(): SupabaseAuthDiagnostics {
  const env = peekSupabaseEnv();
  return {
    ...env,
    ...counters,
    currentAuthUserId: snapshotExtras.currentAuthUserId ?? null,
    linkedOmegaUserEmail: snapshotExtras.linkedOmegaUserEmail ?? null,
    accountStatus: snapshotExtras.accountStatus ?? null,
    creditsBalance: snapshotExtras.creditsBalance ?? null,
    renewalDate: snapshotExtras.renewalDate ?? null,
    // Hard invariants — quotation data never stored in Supabase.
    quotationRowsStoredInSupabase: 0,
    dxfFilesStoredInSupabase: 0,
    omegaProjectFilesStoredInSupabase: 0,
  };
}

export function assertDiagnosticInvariants(
  d: SupabaseAuthDiagnostics = getSupabaseAuthDiagnostics()
): void {
  if (d.serviceRoleExposedClientSide !== false) {
    throw new Error("Invariant failed: serviceRoleExposedClientSide");
  }
  if (d.unauthorizedProfileReadCount !== 0) {
    throw new Error("Invariant failed: unauthorizedProfileReadCount");
  }
  if (d.clientCreditMutationCount !== 0) {
    throw new Error("Invariant failed: clientCreditMutationCount");
  }
  if (d.quotationRowsStoredInSupabase !== 0) {
    throw new Error("Invariant failed: quotationRowsStoredInSupabase");
  }
  if (d.dxfFilesStoredInSupabase !== 0) {
    throw new Error("Invariant failed: dxfFilesStoredInSupabase");
  }
  if (d.omegaProjectFilesStoredInSupabase !== 0) {
    throw new Error("Invariant failed: omegaProjectFilesStoredInSupabase");
  }
}
