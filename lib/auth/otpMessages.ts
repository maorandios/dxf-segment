/**
 * Map Supabase Auth OTP errors to clear Hebrew messages.
 * Never expose raw provider payloads to the UI.
 */

export const AUTH_MESSAGES = {
  unregistered: 'כתובת הדוא"ל אינה רשומה במערכת',
  inactive: "הגישה לחשבון זה אינה פעילה",
  invalidOtp: "הקוד שהוזן אינו תקין",
  expiredOtp: "תוקף הקוד פג. שלח קוד חדש",
  rateLimited: "לא ניתן לשלוח קוד נוסף עדיין",
  sendFailed: "אירעה תקלה בשליחת הקוד. נסה שוב",
  verifyFailed: "אירעה תקלה באימות הקוד. נסה שוב",
  insufficientCredits: "אין מספיק קרדיטים ליצירת הצעת מחיר חדשה",
} as const;

export function mapOtpRequestError(error: {
  message?: string;
  status?: number;
  code?: string;
}): string {
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  if (
    error.status === 429 ||
    code.includes("over_email") ||
    msg.includes("rate") ||
    msg.includes("too many")
  ) {
    return AUTH_MESSAGES.rateLimited;
  }
  if (
    msg.includes("not allowed") ||
    msg.includes("signup") ||
    msg.includes("disabled")
  ) {
    return AUTH_MESSAGES.unregistered;
  }
  return AUTH_MESSAGES.sendFailed;
}

export function mapOtpVerifyError(error: {
  message?: string;
  status?: number;
  code?: string;
}): string {
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  if (
    msg.includes("expired") ||
    code.includes("otp_expired") ||
    msg.includes("token has expired")
  ) {
    return AUTH_MESSAGES.expiredOtp;
  }
  if (
    msg.includes("invalid") ||
    msg.includes("token") ||
    code.includes("otp") ||
    error.status === 401 ||
    error.status === 403
  ) {
    return AUTH_MESSAGES.invalidOtp;
  }
  return AUTH_MESSAGES.verifyFailed;
}

export function isSixDigitOtp(token: string): boolean {
  return /^\d{6}$/.test(token.trim());
}
