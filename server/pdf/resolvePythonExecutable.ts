/**
 * Resolve a working Python executable for PDF rendering.
 * Windows often has a broken Store `python3` stub — prefer `py -3` / `python`.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type ResolvedPython = {
  command: string;
  prefixArgs: string[];
};

function canRun(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, {
      stdio: "ignore",
      timeout: 8_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function windowsProgramFilesPython(): string[] {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
  ].filter((v): v is string => Boolean(v));
  const out: string[] = [];
  for (const root of roots) {
    const base = path.join(root, "Programs", "Python");
    if (!fs.existsSync(base)) continue;
    try {
      for (const dir of fs.readdirSync(base)) {
        const exe = path.join(base, dir, "python.exe");
        if (fs.existsSync(exe)) out.push(exe);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function resolvePythonExecutable(): ResolvedPython {
  const override = process.env.QUOTE_PDF_PYTHON?.trim();
  if (override) {
    if (canRun(override, ["--version"])) {
      return { command: override, prefixArgs: [] };
    }
    throw new Error(
      `QUOTE_PDF_PYTHON is set to "${override}" but it is not runnable`
    );
  }

  const candidates: ResolvedPython[] =
    process.platform === "win32"
      ? [
          { command: "py", prefixArgs: ["-3"] },
          { command: "python", prefixArgs: [] },
          ...windowsProgramFilesPython().map((command) => ({
            command,
            prefixArgs: [] as string[],
          })),
        ]
      : [
          { command: "python3", prefixArgs: [] },
          { command: "python", prefixArgs: [] },
        ];

  for (const candidate of candidates) {
    const probeArgs = [...candidate.prefixArgs, "--version"];
    if (canRun(candidate.command, probeArgs)) return candidate;
  }

  throw Object.assign(
    new Error(
      "Python not found for PDF export (tried py/python/python3). Install Python 3 and: pip install -r server/requirements-pdf.txt && python -m playwright install chromium"
    ),
    { code: "PYTHON_ENOENT" }
  );
}

export function isPythonMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PYTHON_ENOENT" || e.code === "ENOENT") return true;
  const msg = e.message ?? "";
  return /spawn .+ ENOENT|Python not found/i.test(msg);
}
