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
