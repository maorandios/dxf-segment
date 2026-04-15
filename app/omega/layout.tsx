"use client";

import { useSyncExternalStore } from "react";
import { App as KonstaApp } from "konsta/react";
import { OmegaShell } from "@/features/omega/components/OmegaShell";

function subscribeDarkMode(onChange: () => void) {
  const root = document.documentElement;
  const mo = new MutationObserver(onChange);
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

function getIsDark(): boolean {
  return !document.documentElement.classList.contains("light");
}

function getServerIsDark(): boolean {
  return true;
}

export default function OmegaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const isDark = useSyncExternalStore(
    subscribeDarkMode,
    getIsDark,
    getServerIsDark
  );

  return (
    <KonstaApp theme="material" dark={isDark} safeAreas>
      <OmegaShell>{children}</OmegaShell>
    </KonstaApp>
  );
}
