"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyOmegaColorScheme,
  OMEGA_COLOR_SCHEME_KEY,
  type OmegaColorScheme,
} from "@/lib/theme/omegaColorScheme";
import { List, ListItem, Toggle } from "konsta/react";

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

  const onCheckedChange = useCallback(() => {
    const next: OmegaColorScheme = isLight ? "dark" : "light";
    applyOmegaColorScheme(next);
  }, [isLight]);

  return (
    <List strong inset nested>
      <ListItem
        label
        title="תצוגה בהירה"
        after={
          <Toggle
            component="div"
            className="-my-1"
            checked={isLight}
            onChange={onCheckedChange}
          />
        }
      />
    </List>
  );
}
