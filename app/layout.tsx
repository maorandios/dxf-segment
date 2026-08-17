import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { RootChrome } from "@/components/layout/RootChrome";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { OMEGA_THEME_BOOT_SCRIPT } from "@/lib/theme/omegaColorScheme";

const googleSans = localFont({
  src: [
    {
      path: "../public/fonts/google-sans/GoogleSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/google-sans/GoogleSans-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../public/fonts/google-sans/GoogleSans-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/google-sans/GoogleSans-MediumItalic.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../public/fonts/google-sans/GoogleSans-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/google-sans/GoogleSans-SemiBoldItalic.ttf",
      weight: "600",
      style: "italic",
    },
    {
      path: "../public/fonts/google-sans/GoogleSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/google-sans/GoogleSans-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-google-sans",
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

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://segment.getsegments.co");

const SHARE_DESCRIPTION =
  "סגמנט הינה מערכת יצירת הצעות מחיר לענף המתכת בישראל, המערכת מבוססת בינה מלאכותית ואלגוריתמים הנדסיים. באמצעותה ניתן להגיע להחלטות עסקיות במהירות ולהפיק הצעת מחיר בהתאם";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "סגמנט — הצעות מחיר לענף המתכת",
  description: SHARE_DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/fav2.svg", type: "image/svg+xml" }],
    apple: [{ url: "/fav2.svg" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "סגמנט",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: "/",
    siteName: "סגמנט",
    title: "סגמנט — הצעות מחיר לענף המתכת",
    description: SHARE_DESCRIPTION,
    images: [
      {
        url: "/OP.png",
        width: 1200,
        height: 630,
        alt: "סגמנט",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "סגמנט — הצעות מחיר לענף המתכת",
    description: SHARE_DESCRIPTION,
    images: ["/OP.png"],
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
        <link rel="icon" href="/fav2.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/fav2.svg" />
      </head>
      <body
        className={`${googleSans.variable} ${googleSans.className} antialiased`}
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
