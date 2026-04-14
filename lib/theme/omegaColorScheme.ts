/** localStorage key for light vs dark (Omega + global app chrome). */
export const OMEGA_COLOR_SCHEME_KEY = "omega-color-scheme";

export type OmegaColorScheme = "light" | "dark";

export function getStoredOmegaColorScheme(): OmegaColorScheme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(OMEGA_COLOR_SCHEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function applyOmegaColorScheme(scheme: OmegaColorScheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", scheme === "light");
  try {
    window.localStorage.setItem(OMEGA_COLOR_SCHEME_KEY, scheme);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Inline boot snippet — keep in sync with applyOmegaColorScheme */
export const OMEGA_THEME_BOOT_SCRIPT = `!function(){try{var t=localStorage.getItem(${JSON.stringify(
  OMEGA_COLOR_SCHEME_KEY
)});document.documentElement.classList.toggle("light",t==="light");}catch(e){}}();`;
