"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyOmegaColorScheme,
  OMEGA_COLOR_SCHEME_KEY,
  type OmegaColorScheme,
} from "@/lib/theme/omegaColorScheme";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

  const onCheckedChange = useCallback((checked: boolean) => {
    const next: OmegaColorScheme = checked ? "light" : "dark";
    applyOmegaColorScheme(next);
  }, []);

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl px-4 py-3.5"
      dir="rtl"
      suppressHydrationWarning
    >
      <Label
        htmlFor="omega-light-mode"
        className="cursor-pointer text-base font-medium text-foreground"
      >
        תצוגה בהירה
      </Label>
      <div dir="ltr" className="shrink-0" suppressHydrationWarning>
        <Switch
          id="omega-light-mode"
          checked={isLight}
          onCheckedChange={onCheckedChange}
          aria-label={isLight ? "מצב בהיר פעיל" : "מצב כהה פעיל"}
        />
      </div>
    </div>
  );
}
