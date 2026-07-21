/**
 * OMEGA Simple Intake — desktop workflow design tokens (light mode).
 * Prefer CSS variables (`.omega-workflow`) over scattering raw colors.
 */

export const uiTokens = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceMuted: "#F2F4F7",
  border: "#E4E7EC",
  borderStrong: "#D0D5DD",

  textPrimary: "#101828",
  textSecondary: "#475467",
  textMuted: "#667085",

  accent: "#0F766E",
  accentHover: "#115E59",
  accentSoft: "#E7F6F3",
  accentForeground: "#FFFFFF",

  success: "#15803D",
  successSoft: "#ECFDF3",

  attention: "#B45309",
  attentionSoft: "#FFF7E6",

  error: "#B42318",
  errorSoft: "#FEF3F2",

  info: "#175CD3",
  infoSoft: "#EFF8FF",

  shadowSm: "0 1px 2px rgba(16, 24, 40, 0.05)",
  shadowMd: "0 4px 16px -4px rgba(16, 24, 40, 0.08)",
  radius: "10px",
  radiusSm: "6px",
  radiusLg: "14px",
} as const;

export type UiTokenKey = keyof typeof uiTokens;
