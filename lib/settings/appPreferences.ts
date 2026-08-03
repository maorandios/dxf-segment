import type { AppPreferences } from "@/types/settings";
import { DEFAULT_APP_PREFERENCES } from "@/types/settings";

const STORAGE_KEY = "plate_app_preferences";

function loadRaw(): AppPreferences {
  if (typeof window === "undefined") return DEFAULT_APP_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      ...DEFAULT_APP_PREFERENCES,
      ...parsed,
      unitSystem:
        parsed.unitSystem === "imperial" || parsed.unitSystem === "metric"
          ? parsed.unitSystem
          : DEFAULT_APP_PREFERENCES.unitSystem,
      companyName:
        typeof parsed.companyName === "string" ? parsed.companyName : undefined,
      companyEmail:
        typeof parsed.companyEmail === "string" ? parsed.companyEmail : undefined,
      companyPhone:
        typeof parsed.companyPhone === "string" ? parsed.companyPhone : undefined,
      companyWebsite:
        typeof parsed.companyWebsite === "string"
          ? parsed.companyWebsite
          : undefined,
      companyAddress:
        typeof parsed.companyAddress === "string"
          ? parsed.companyAddress
          : undefined,
      companyRegistrationNumber:
        typeof parsed.companyRegistrationNumber === "string"
          ? parsed.companyRegistrationNumber
          : undefined,
      contactName:
        typeof parsed.contactName === "string" ? parsed.contactName : undefined,
    };
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

export function getAppPreferences(): AppPreferences {
  return loadRaw();
}

export function saveAppPreferences(next: AppPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("[PLATE] Failed to save app preferences", e);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("plate-app-preferences-changed"));
  }
}
