import type { Metadata, Viewport } from "next";
import { Noto_Sans_Hebrew, Rubik } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { RootChrome } from "@/components/layout/RootChrome";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { OMEGA_THEME_BOOT_SCRIPT } from "@/lib/theme/omegaColorScheme";
import messages from "@/messages/he.json";

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
  title: messages.meta.title,
  description: messages.meta.description,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Omega",
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
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.svg" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon-192x192.svg" />
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
