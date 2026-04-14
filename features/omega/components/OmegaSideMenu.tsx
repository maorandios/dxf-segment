"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OmegaThemeToggle } from "./OmegaThemeToggle";
import { cn } from "@/lib/utils";

const MENU_LINKS: { href: string; label: string }[] = [
  { href: "/omega", label: "ראשי" },
  { href: "/omega/quotes", label: "הצעות מחיר" },
  { href: "/settings/account", label: "הגדרת פרופיל" },
  { href: "/settings/bill-and-usage", label: "חיוב" },
];

function linkActive(pathname: string, href: string): boolean {
  if (href === "/omega") return pathname === "/omega";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OmegaSideMenu() {
  const pathname = usePathname() ?? "";

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-11 w-11 shrink-0 rounded-full border-0 p-0 shadow-none",
            "omega-app-icon-hit text-muted-foreground",
            "hover:bg-transparent hover:text-foreground hover:opacity-95"
          )}
          aria-label="פתיחת תפריט"
        >
          <Menu className="size-5" strokeWidth={2} />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "omega-menu-overlay-el omega-app-menu-overlay fixed inset-0 z-[60]"
          )}
        />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn(
            "omega-sidebar-panel omega-app-drawer fixed inset-y-0 left-0 z-[61] flex w-[min(100%,20rem)] max-w-[min(100%,20rem)] flex-col outline-none",
            "rounded-r-[1.75rem]",
            "pt-[env(safe-area-inset-top,0px)]"
          )}
        >
          <DialogPrimitive.Title className="sr-only">תפריט ראשי</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            קישורי ניווט, הגדרות חשבון והתנתקות
          </DialogPrimitive.Description>

          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              תפריט
            </span>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-10 w-10 shrink-0 rounded-full border-0 p-0 shadow-none",
                  "omega-app-icon-hit text-muted-foreground",
                  "hover:bg-transparent hover:text-foreground hover:opacity-95"
                )}
                aria-label="סגירת תפריט"
              >
                <X className="size-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <nav
            className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-4 pt-1"
            aria-label="קישורים"
          >
            {MENU_LINKS.map(({ href, label }) => (
              <DialogPrimitive.Close key={href} asChild>
                <Link
                  href={href}
                  className={cn(
                    "rounded-2xl px-4 py-3.5 text-base font-medium transition-colors",
                    "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omega-surface)]",
                    linkActive(pathname, href)
                      ? "bg-muted/90 text-primary"
                      : "text-foreground"
                  )}
                >
                  {label}
                </Link>
              </DialogPrimitive.Close>
            ))}
          </nav>

          <div className="shrink-0 px-1 pb-2 pt-1">
            <OmegaThemeToggle />
          </div>

          <div className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-3 rounded-xl px-4 py-3.5 text-base font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  // Placeholder — same as AppTopBar logout
                }}
              >
                <span>התנתק</span>
                <LogOut className="size-4 shrink-0 opacity-90" aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
