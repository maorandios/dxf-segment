import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Chromium packages outside the webpack bundle so relative bin paths work.
  serverExternalPackages: [
    "@sparticuz/chromium-min",
    "puppeteer-core",
    "nunjucks",
  ],
  async rewrites() {
    return [
      // Browsers still request /favicon.ico by default
      {
        source: "/favicon.ico",
        destination: "/fav.svg",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
