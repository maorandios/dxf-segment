import type { Metadata, Viewport } from "next";
import { Noto_Sans_Hebrew, Rubik } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { RootChrome } from "@/components/layout/RootChrome";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { OMEGA_THEME_BOOT_SCRIPT } from "@/lib/theme/omegaColorScheme";

const notoSansHebrew = Noto_Sans_Hebrew({
  subsets: ["hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-hebrew",
  display: "swap",
});

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090F0F" },
    { media: "(prefers-color-scheme: light)", color: "#f8f8f8" },
  ],
};

export const metadata: Metadata = {
  title: "סגמנט — הצעות מחיר לענף המתכת",
  description:
    "מערכת יצירת הצעות מחיר לענף המתכת בישראל, מבוססת בינה מלאכותית ואלגוריתמים הנדסיים",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/fav.svg", type: "image/svg+xml" }],
    apple: [{ url: "/fav.svg" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "סגמנט",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/fav.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/fav.svg" />
      </head>
      <body
        className={`${notoSansHebrew.variable} ${rubik.variable} ${notoSansHebrew.className} antialiased`}
      >
        <Script
          id="omega-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: OMEGA_THEME_BOOT_SCRIPT }}
        />
        <ServiceWorkerRegistrar />
        <RootChrome>{children}</RootChrome>
      </body>
    </html>
  );
}
