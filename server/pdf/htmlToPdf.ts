/**
 * HTML → PDF via Chromium.
 * Local: system Chrome/Edge or puppeteer channel.
 * Vercel: @sparticuz/chromium.
 */

import type { Browser } from "puppeteer-core";

const FOOTER_HTML = `
<div style="width:100%;box-sizing:border-box;padding:4px 20mm 0;font-family:'Segoe UI','Arial Hebrew',Arial,sans-serif;font-size:9px;line-height:1.35;color:#344054;direction:rtl;">
  <div style="border-top:1px solid #98a2b3;padding-top:6px;display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;">
    <span style="white-space:nowrap;">הצעת המחיר הזו הופקה באמצעות מערכת סגמנט</span>
    <span style="white-space:nowrap;">עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span>
  </div>
</div>
`.trim();

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = await import("@sparticuz/chromium");
    return puppeteer.default.launch({
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(),
      headless: true,
    });
  }

  // Local Windows/macOS/Linux — prefer installed Chrome/Edge
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter((v): v is string => Boolean(v));

  let lastErr: unknown;
  for (const executablePath of candidates) {
    try {
      return await puppeteer.default.launch({
        executablePath,
        headless: true,
        args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"],
      });
    } catch (err) {
      lastErr = err;
    }
  }

  throw Object.assign(
    new Error(
      `Chromium/Chrome not found for PDF export. Install Google Chrome or set CHROME_PATH. ${
        lastErr instanceof Error ? lastErr.message : ""
      }`
    ),
    { code: "CHROMIUM_ENOENT" }
  );
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    const pdf = await page.pdf({
      format: "A4",
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: FOOTER_HTML,
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "18mm",
        left: "20mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
