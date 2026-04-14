"use client";

import { usePathname } from "next/navigation";
import { AppTopBar } from "@/components/shared/AppTopBar";

function isOmegaPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/omega" || pathname.startsWith("/omega/");
}

export function RootChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isOmegaPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <AppTopBar />
      <div className="flex min-h-0 min-w-0 w-full max-w-none flex-1 flex-col overflow-auto">
        {children}
      </div>
    </div>
  );
}
