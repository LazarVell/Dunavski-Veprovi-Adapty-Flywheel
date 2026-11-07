import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Thin wrapper over the Adapty Developer CLI (`adapty`), the same surface the Adapty agent skills use.
 * Runs the CLI's JS entry with this Node binary (no shell), so arguments are never shell-interpreted.
 */
export const APP_ID = process.env.ADAPTY_APP_ID || "e27c8246-b940-45f0-a76e-5b119afbfa0a";

function cliEntry(): string | null {
  const candidates = [
    process.env.ADAPTY_CLI_JS,
    process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "adapty", "bin", "run.js"),
    "/usr/local/lib/node_modules/adapty/bin/run.js",
    "/opt/homebrew/lib/node_modules/adapty/bin/run.js",
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export class CliError extends Error {
  constructor(message: string, public exitCode: number | null, public stderr: string) {
    super(message);
  }
}

export function adapty<T = unknown>(args: string[], { json = true } = {}): Promise<T> {
  const entry = cliEntry();
  const [cmd, argv] = entry ? [process.execPath, ["--stack-size=4000", entry, ...args]] : ["adapty", args];
  if (json) argv.push("--json");
  return new Promise((resolve, reject) => {
    execFile(cmd, argv, { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, windowsHide: true }, (err, stdout, stderr) => {
      const out = stdout.replace(/^﻿/, "").trim();
      if (err) {
        // exit 4 = rate limited (2 req/s per app); the CLI never retries by itself
        const code = typeof err.code === "number" ? err.code : null;
        return reject(new CliError(`adapty ${args.slice(0, 3).join(" ")} failed (exit ${code}): ${(stderr || out).slice(0, 600)}`, code, stderr));
      }
      try {
        resolve((json ? JSON.parse(out) : out) as T);
      } catch {
        reject(new CliError(`adapty ${args.slice(0, 3).join(" ")}: output was not JSON`, 0, out.slice(0, 300)));
      }
    });
  });
}

export function withTempJson<R>(obj: unknown, fn: (file: string) => Promise<R>): Promise<R> {
  const file = path.join(os.tmpdir(), `flywheel-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(obj));
  return fn(file).finally(() => fs.rmSync(file, { force: true }));
}
