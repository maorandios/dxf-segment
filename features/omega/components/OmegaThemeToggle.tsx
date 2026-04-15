"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyOmegaColorScheme,
  OMEGA_COLOR_SCHEME_KEY,
  type OmegaColorScheme,
} from "@/lib/theme/omegaColorScheme";
import { Sun, Moon } from "lucide-react";

function subscribe(onChange: () => void) {
  const root = document.documentElement;
  const mo = new MutationObserver(onChange);
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  const onStorage = (e: StorageEvent) => {
    if (e.key !== OMEGA_COLOR_SCHEME_KEY || e.newValue == null) return;
    if (e.newValue === "light" || e.newValue === "dark") {
      applyOmegaColorScheme(e.newValue);
    }
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    mo.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

function getLightSnapshot(): boolean {
  return document.documentElement.classList.contains("light");
}

function getServerLightSnapshot(): boolean {
  return false;
}

export function OmegaThemeToggle() {
  const isLight = useSyncExternalStore(
    subscribe,
    getLightSnapshot,
    getServerLightSnapshot
  );

  const toggle = useCallback(() => {
    const next: OmegaColorScheme = isLight ? "dark" : "light";
    applyOmegaColorScheme(next);
  }, [isLight]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-xl px-4 py-3 bg-white/5"
    >
      <span className="flex items-center gap-3">
        {isLight ? <Sun className="size-5" /> : <Moon className="size-5" />}
        <span>{isLight ? "תצוגה בהירה" : "תצוגה כהה"}</span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
          isLight ? "bg-primary" : "bg-white/20"
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            isLight ? "translate-x-1" : "translate-x-5"
          }`}
        />
      </span>
    </button>
  );
}
