"use client";

import dynamic from "next/dynamic";
import { OmegaShell } from "@/features/omega/components/OmegaShell";

const KonstaProvider = dynamic(() => import("./KonstaClientProvider"), {
  ssr: false,
});

export default function OmegaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <KonstaProvider>
      <OmegaShell>{children}</OmegaShell>
    </KonstaProvider>
  );
}
