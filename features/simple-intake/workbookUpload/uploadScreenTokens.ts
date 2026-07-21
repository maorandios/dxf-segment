/**
 * Tokens for WORKBOOK_UPLOAD screen only (light mode) — v2 polish.
 */

export const uploadScreenTokens = {
  pageBg: "#F8FAFB",
  page: "#F8FAFB",
  surface: "#FFFFFF",
  surfaceSoft: "#F5F8F9",
  surfaceMuted: "#F2F5F7",
  border: "#E5E9EE",
  borderStrong: "#D6DEE6",
  textPrimary: "#13202B",
  textSecondary: "#5C6978",
  textMuted: "#8B96A3",
  accent: "#0F766E",
  accentHover: "#0B625C",
  accentSoft: "#E8F6F3",
  success: "#16A34A",
  successSoft: "#EDF9F0",
  error: "#B42318",
  errorSoft: "#FEF3F2",
  shadow: "0 20px 60px rgba(15, 23, 42, 0.06)",
  shadowDock: "0 8px 24px rgba(15, 23, 42, 0.05)",
  radius: "28px",
} as const;

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

export function firstNameFromFullName(name: string): string | null {
  const first = name.trim().split(/\s+/).filter(Boolean)[0];
  return first || null;
}
