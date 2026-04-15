import { OmegaShell } from "@/features/omega/components/OmegaShell";

export default function OmegaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <OmegaShell>{children}</OmegaShell>;
}
