/**
 * HTML → PDF via Chromium.
 * Local: system Chrome/Edge.
 * Vercel: @sparticuz/chromium-min + remote chromium pack (binaries not in the function bundle).
 */

import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";

const FOOTER_HTML = `
<div style="width:100%;box-sizing:border-box;padding:4px 20mm 0;font-family:'Segoe UI','Arial Hebrew',Arial,sans-serif;font-size:9px;line-height:1.35;color:#344054;direction:rtl;">
  <div style="border-top:1px solid #98a2b3;padding-top:6px;display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;">
    <span style="white-space:nowrap;">הצעת המחיר הזו הופקה באמצעות מערכת סגמנט</span>
    <span style="white-space:nowrap;">עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span>
  </div>
</div>
`.trim();

/** Hosted chromium pack — keep version in sync with @sparticuz/chromium-min. */
function defaultChromiumPackUrl(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.${arch}.tar`;
}

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FINAL_QUOTATION_PDF_ENGINE === "node"
  );
}

async function launchBrowser(): Promise<Browser> {
  if (isServerlessRuntime()) {
    const packUrl =
      process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim() || defaultChromiumPackUrl();
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({
        args: chromium.args,
        headless: "shell",
      }),
      executablePath: await chromium.executablePath(packUrl),
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
      return await puppeteer.launch({
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
