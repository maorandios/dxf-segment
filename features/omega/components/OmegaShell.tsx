"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Page,
  Navbar,
  Tabbar,
  TabbarLink,
  Panel,
  List,
  ListItem,
  Block,
  Button,
} from "konsta/react";
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
  {
    href: "/omega",
    label: "בית",
    icon: Home,
    match: (p: string) => p === "/omega",
  },
  {
    href: "/omega/new",
    label: "חדש",
    icon: PlusCircle,
    match: (p: string) => p === "/omega/new" || p.startsWith("/omega/new/"),
  },
  {
    href: "/omega/requests",
    label: "בקשות",
    icon: ClipboardList,
    match: (p: string) =>
      p === "/omega/requests" || p.startsWith("/omega/requests/"),
  },
  {
    href: "/omega/settings",
    label: "הגדרות",
    icon: Settings,
    match: (p: string) =>
      p === "/omega/settings" || p.startsWith("/omega/settings/"),
  },
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

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

  return (
    <div dir="rtl" className="omega-app min-h-svh w-full font-[var(--font-rubik)]">
      <Page
        className="!bg-[var(--omega-page-bg)]"
      >
        <Navbar
          title="Omega"
          right={
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="flex items-center justify-center p-2"
              aria-label="פתיחת תפריט"
            >
              <Menu className="size-5" />
            </button>
          }
          className="!bg-[var(--omega-surface)]"
        />

        <Tabbar
          labels
          icons
          className="fixed bottom-0 left-0 right-0 z-50"
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <TabbarLink
                key={href}
                active={active}
                onClick={() => navigate(href)}
                icon={<Icon className="size-6" />}
                label={label}
              />
            );
          })}
        </Tabbar>

        <div className="px-4 pb-24 pt-4" dir="rtl">
          {children}
        </div>
      </Page>

      <Panel
        side="left"
        opened={panelOpen}
        onBackdropClick={() => setPanelOpen(false)}
      >
        <Page>
          <Navbar
            title="תפריט"
            right={
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="flex items-center justify-center p-2"
                aria-label="סגירת תפריט"
              >
                <X className="size-5" />
              </button>
            }
          />
          <List strong inset>
            {MENU_LINKS.map(({ href, label }) => (
              <ListItem
                key={href}
                title={label}
                link
                onClick={() => {
                  setPanelOpen(false);
                  navigate(href);
                }}
              />
            ))}
          </List>
          <Block className="space-y-4">
            <OmegaThemeToggle />
          </Block>
          <Block>
            <Button
              large
              className="k-color-brand-red"
              onClick={() => {
                setPanelOpen(false);
              }}
            >
              <span className="flex items-center gap-2">
                <LogOut className="size-4" />
                התנתק
              </span>
            </Button>
          </Block>
        </Page>
      </Panel>
    </div>
  );
}
