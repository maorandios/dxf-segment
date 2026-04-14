import type { Metadata } from "next";
import { OmegaShell } from "@/features/omega/components/OmegaShell";

export const metadata: Metadata = {
  title: "Omega",
};

export default function OmegaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <OmegaShell>{children}</OmegaShell>;
}
