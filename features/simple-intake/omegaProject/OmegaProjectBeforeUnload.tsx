"use client";

/**
 * Warns the user via the native "leave site?" browser prompt when there are
 * unsaved portable-project changes. Renders nothing. Mount once near the
 * root of the Simple Intake shell.
 */

import { useEffect } from "react";
import { hasUnsavedProjectChanges } from "./dirtyState";

export function OmegaProjectBeforeUnload(): null {
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!hasUnsavedProjectChanges()) return;
      event.preventDefault();
      // Legacy browsers require setting returnValue explicitly.
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return null;
}
