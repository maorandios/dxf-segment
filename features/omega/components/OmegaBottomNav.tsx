"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, PlusCircle, Settings } from "lucide-react";
import { omegaShellWidthClass } from "../omegaShellTokens";
import { cn } from "@/lib/utils";

const NAV_ITEMS: {
  href: string;
  label: string;
  icon: typeof Home;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: "/omega",
    label: "בית",
    icon: Home,
    match: (p) => p === "/omega",
  },
  {
    href: "/omega/new",
    label: "חדש",
    icon: PlusCircle,
    match: (p) => p === "/omega/new" || p.startsWith("/omega/new/"),
  },
  {
    href: "/omega/requests",
    label: "בקשות",
    icon: ClipboardList,
    match: (p) => p === "/omega/requests" || p.startsWith("/omega/requests/"),
  },
  {
    href: "/omega/settings",
    label: "הגדרות",
    icon: Settings,
    match: (p) => p === "/omega/settings" || p.startsWith("/omega/settings/"),
  },
];

export function OmegaBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 pt-1 sm:px-4"
      dir="rtl"
    >
      <nav
        className={cn(
          "omega-app-bottom-nav flex items-stretch justify-between gap-1 rounded-2xl px-2 pt-2.5 pb-[calc(0.55rem+env(safe-area-inset-bottom,0px))] sm:px-4 md:px-5",
          omegaShellWidthClass
        )}
        aria-label="ניווט ראשי"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  active && "stroke-[2.5px]"
                )}
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
