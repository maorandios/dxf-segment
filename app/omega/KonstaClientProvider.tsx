"use client";

import { useState, useEffect, type ReactNode } from "react";
import { App as KonstaApp } from "konsta/react";

function getIsDark(): boolean {
  return !document.documentElement.classList.contains("light");
}

export default function KonstaClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isDark, setIsDark] = useState(getIsDark);

  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() => setIsDark(getIsDark()));
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  return (
    <KonstaApp theme="material" dark={isDark} safeAreas>
      {children}
    </KonstaApp>
  );
}
