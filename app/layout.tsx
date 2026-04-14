import type { Metadata } from "next";
import { Noto_Sans_Hebrew } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { RootChrome } from "@/components/layout/RootChrome";
import { OMEGA_THEME_BOOT_SCRIPT } from "@/lib/theme/omegaColorScheme";
import messages from "@/messages/he.json";

const notoSansHebrew = Noto_Sans_Hebrew({
  subsets: ["hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-hebrew",
  display: "swap",
});

export const metadata: Metadata = {
  title: messages.meta.title,
  description: messages.meta.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body
        className={`${notoSansHebrew.variable} ${notoSansHebrew.className} antialiased`}
      >
        <Script
          id="omega-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: OMEGA_THEME_BOOT_SCRIPT }}
        />
        <RootChrome>{children}</RootChrome>
      </body>
    </html>
  );
}
