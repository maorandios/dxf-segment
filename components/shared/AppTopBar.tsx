"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { openAccountModal } from "@/features/accountModals";

const dividerClass = "w-px shrink-0 self-stretch bg-white/[0.08]";

const MAIN_NAV: {
  labelKey: "nav.dashboard" | "nav.quotes" | "nav.clients";
  href: string;
}[] = [
  { labelKey: "nav.dashboard", href: "/" },
  { labelKey: "nav.quotes", href: "/quotes" },
  { labelKey: "nav.clients", href: "/clients" },
];

const SETTINGS_ACTIONS: {
  labelKey: "nav.accountSettings" | "nav.materialsConfig" | "nav.billAndUsage";
  modal: "COMPANY_SETTINGS" | "MATERIAL_SETTINGS" | "BILLING_USAGE";
}[] = [
  { labelKey: "nav.accountSettings", modal: "COMPANY_SETTINGS" },
  { labelKey: "nav.materialsConfig", modal: "MATERIAL_SETTINGS" },
  { labelKey: "nav.billAndUsage", modal: "BILLING_USAGE" },
];

function linkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Shared sizing for industrial equal-width nav cells */
const navCellClass =
  "flex h-14 min-h-14 w-full min-w-0 items-center justify-center px-2 text-center text-sm font-medium leading-tight tracking-tight";

export function AppTopBar() {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="sticky top-0 z-50 w-full shrink-0 border-b border-white/[0.08] bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 w-full max-w-none items-stretch justify-between gap-3 px-4 lg:px-6">
        {/* RTL: first cluster → inline-end (right); logo + primary nav */}
        <div className="flex min-w-0 flex-1 items-stretch gap-0">
          <Link
            href="/"
            className="flex shrink-0 items-center py-2 pe-4 sm:pe-5"
            aria-label={t("brand.name")}
          >
            <Image
              src="/main%20logo.svg"
              alt=""
              width={538}
              height={209}
              priority
              className="h-9 w-auto max-w-[12rem] object-contain object-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:h-10 sm:max-w-[14.5rem]"
            />
          </Link>

          <div className={dividerClass} aria-hidden />

          <nav
            className="grid h-14 min-h-14 min-w-0 flex-1 grid-cols-4 divide-x divide-white/[0.08] overflow-hidden"
            aria-label={t("layout.mainNavAria")}
          >
            {MAIN_NAV.map(({ labelKey, href }) => {
              const active = linkActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    navCellClass,
                    active
                      ? "bg-white/[0.1] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  )}
                >
                  {t(labelKey)}
                </Link>
              );
            })}

            <div className="flex min-h-0 min-w-0 items-stretch">
              <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    ref={settingsTriggerRef}
                    type="button"
                    className={cn(
                      navCellClass,
                      "gap-1",
                      settingsActive
                        ? "bg-white/[0.1] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    )}
                    data-account-menu-trigger="true"
                  >
                    <span className="min-w-0 truncate">{t("nav.settings")}</span>
                    <ChevronDown
                      className="h-3.5 w-3.5 shrink-0 opacity-70"
                      aria-hidden
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  {SETTINGS_ACTIONS.map(({ labelKey, modal }) => (
                    <DropdownMenuItem
                      key={modal}
                      className="cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                        setSettingsOpen(false);
                        openAccountModal(modal, settingsTriggerRef.current);
                      }}
                      data-account-menu-item={modal}
                    >
                      {t(labelKey)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    disabled
                    className="opacity-60"
                    title="לא זמין כרגע"
                    aria-disabled="true"
                    data-logout-inactive="true"
                  >
                    {t("layout.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </nav>
        </div>

        {/* RTL: second cluster → inline-start (left); logout (inactive) */}
        <div className="flex shrink-0 items-center self-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground opacity-50"
            aria-label={t("layout.logoutAria")}
            title="לא זמין כרגע"
            disabled
            data-logout-inactive="true"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
