"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  PlusCircle,
  ClipboardList,
  Settings,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { OmegaThemeToggle } from "./OmegaThemeToggle";

const NAV_ITEMS = [
  { href: "/omega", label: "בית", icon: Home, match: (p: string) => p === "/omega" },
  { href: "/omega/new", label: "חדש", icon: PlusCircle, match: (p: string) => p === "/omega/new" || p.startsWith("/omega/new/") },
  { href: "/omega/requests", label: "בקשות", icon: ClipboardList, match: (p: string) => p === "/omega/requests" || p.startsWith("/omega/requests/") },
  { href: "/omega/settings", label: "הגדרות", icon: Settings, match: (p: string) => p === "/omega/settings" || p.startsWith("/omega/settings/") },
];

const MENU_LINKS = [
  { href: "/omega", label: "ראשי" },
  { href: "/omega/quotes", label: "הצעות מחיר" },
  { href: "/settings/account", label: "הגדרת פרופיל" },
  { href: "/settings/bill-and-usage", label: "חיוב" },
];

export function OmegaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  return (
    <div dir="rtl" className="omega-app min-h-svh w-full font-[var(--font-rubik)]">
      {/* App bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between px-4 bg-[var(--omega-surface)] shadow-sm">
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors"
          aria-label="פתיחת תפריט"
        >
          <Menu className="size-5" />
        </button>
        <span className="text-lg font-semibold tracking-tight">Omega</span>
        <span className="text-[9px] opacity-30 absolute bottom-0.5 left-1/2 -translate-x-1/2">v3</span>
        <div className="size-10" />
      </header>

      {/* Scrollable content */}
      <main className="px-4 pb-20 pt-4">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-stretch bg-[var(--omega-surface)] shadow-[0_-1px_3px_rgb(0,0,0,0.15)]">
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors active:bg-white/5 ${
                active ? "text-primary font-medium" : "text-current opacity-50"
              }`}
            >
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Side drawer overlay */}
      <div
        className={`fixed inset-0 z-50 transition-colors duration-300 ${
          panelOpen ? "bg-black/50 pointer-events-auto" : "bg-transparent pointer-events-none"
        }`}
        onClick={() => setPanelOpen(false)}
        aria-hidden={!panelOpen}
      >
        {/* Drawer panel */}
        <div
          ref={panelRef}
          className={`absolute top-0 right-0 h-full w-72 max-w-[80vw] bg-[var(--omega-surface)] shadow-2xl transition-transform duration-300 ease-out ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer header */}
          <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
            <span className="text-lg font-semibold">תפריט</span>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors"
              aria-label="סגירת תפריט"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Drawer links */}
          <ul className="px-2 py-3 space-y-0.5">
            {MENU_LINKS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <button
                    type="button"
                    className={`w-full text-start px-4 py-3 rounded-xl text-sm transition-colors active:bg-white/10 ${
                      active ? "bg-primary/10 text-primary font-medium" : ""
                    }`}
                    onClick={() => { setPanelOpen(false); router.push(href); }}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Theme toggle */}
          <div className="px-4 py-2">
            <OmegaThemeToggle />
          </div>

          {/* Logout */}
          <div className="px-4 pt-4 mt-auto">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 active:bg-red-500/20 transition-colors"
              onClick={() => setPanelOpen(false)}
            >
              <LogOut className="size-4" />
              התנתק
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
