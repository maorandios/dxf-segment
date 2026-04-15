"use client";

import { useState, useEffect } from "react";
import { App as KonstaApp } from "konsta/react";
import { OmegaShell } from "@/features/omega/components/OmegaShell";

function getIsDark(): boolean {
  if (typeof document === "undefined") return true;
  return !document.documentElement.classList.contains("light");
}

export default function OmegaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(getIsDark());

    const root = document.documentElement;
    const mo = new MutationObserver(() => setIsDark(getIsDark()));
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  return (
    <KonstaApp theme="material" dark={isDark} safeAreas>
      <OmegaShell>{children}</OmegaShell>
    </KonstaApp>
  );
}
