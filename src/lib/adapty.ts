import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Thin wrapper over the Adapty Developer CLI (`adapty`), the same surface the Adapty agent skills use.
 * Runs the CLI's JS entry with this Node binary (no shell), so arguments are never shell-interpreted.
 *
 * Nothing here holds an Adapty id: the app is found by its title, placements by developer id,
 * and flows, segments and A/B tests by name, so the same code runs on any account seeded with Lumen.
 */
const APP_TITLE = process.env.ADAPTY_APP_TITLE || "Lumen - AI Photo Editor (Hackathon)";

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

/** oclif's warning when the CLI runs without TypeScript installed: harmless, and never the error. */
const cleanStderr = (s: string) =>
  s
    .split(/\r?\n/)
    .filter((l) => !/Could not find typescript|devDependency|Falling back to compiled source/i.test(l))
    .join("\n")
    .trim();

/** The message inside the CLI's --json error envelope, if stdout is one. */
function cliErrorText(out: string) {
  try {
    const j = JSON.parse(out);
    const e = j?.error ?? j;
    const msg = typeof e === "string" ? e : e?.message ?? e?.detail ?? e?.errors?.[0]?.message ?? e?.errors?.[0]?.detail;
    return msg ? String(msg) + (e?.code ? ` (${e.code})` : "") : out;
  } catch {
    return "";
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
        // With --json the real error is on stdout; stderr often holds only oclif noise ("Could not find typescript…").
        const detail = cliErrorText(out) || cleanStderr(stderr) || out || stderr;
        return reject(new CliError(`adapty ${args.slice(0, 3).join(" ")} failed (exit ${code}): ${detail.slice(0, 600)}`, code, stderr));
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

export function withTempFile<R>(data: Buffer, ext: string, fn: (file: string) => Promise<R>): Promise<R> {
  const file = path.join(os.tmpdir(), `flywheel-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(file, data);
  return fn(file).finally(() => fs.rmSync(file, { force: true }));
}

/** The CLI wraps lists as {data: [...]}; single objects come back bare or as {data: {...}}. */
const rows = <T>(r: { data?: T[] } | T[]): T[] => (Array.isArray(r) ? r : r.data ?? []);
export const unwrap = <T>(r: T | { data: T }): T => (r && typeof r === "object" && "data" in (r as object) ? (r as { data: T }).data : (r as T));

let appIdPromise: Promise<string> | null = null;

/** The Lumen app's id: ADAPTY_APP_ID if set, otherwise looked up by title. */
export function appId(): Promise<string> {
  if (process.env.ADAPTY_APP_ID) return Promise.resolve(process.env.ADAPTY_APP_ID);
  appIdPromise ??= adapty<{ data: { id: string; title: string }[] }>(["apps", "list"])
    .then((r) => {
      const app = rows(r).find((a) => a.title === APP_TITLE);
      if (!app) throw new Error(`No app titled "${APP_TITLE}" in this Adapty account`);
      return app.id;
    })
    .catch((e) => {
      appIdPromise = null; // let the next request try again
      throw e;
    });
  return appIdPromise;
}

export type FlowRow = { id: string; name: string; status: string };
export type SegmentRow = { id: string; title: string };
export type AbTestRow = {
  ab_test_id: string; title: string; state: string; placement: { placement_id: string; title: string };
  segment_ids: string[] | null; started_at: string | null; stopped_at: string | null;
};

export async function findFlowByName(app: string, name: string) {
  const r = await adapty<{ data: FlowRow[] }>(["flows", "list", "--app", app]);
  return rows(r).find((f) => f.name === name) ?? null;
}

export const getFlow = async (app: string, id: string) => unwrap(await adapty<FlowRow | { data: FlowRow }>(["flows", "get", id, "--app", app]));

/**
 * Publishes a flow and waits for it. Adapty publishes in the background: `flows publish` returns
 * `publishing`, then `flows get` turns `published` or `publication_failed`. Polls under the 2 req/s limit.
 */
export async function publishFlow(app: string, id: string, { tries = 20, everyMs = 1500 } = {}) {
  await adapty(["flows", "publish", id, "--app", app, "--yes"]);
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, everyMs));
    const f = await getFlow(app, id);
    if (f.status === "published") return f;
    if (f.status === "publication_failed") throw new Error("Adapty could not publish the flow (publication_failed). Open it in the Flow Builder to see why.");
  }
  throw new Error("Adapty is still publishing the flow. Give it a moment, then click again.");
}

export async function placementIdByDevId(app: string, developerId: string) {
  const r = await adapty<{ data: { id: string; developer_id: string }[] }>(["placements", "list", "--app", app]);
  const p = rows(r).find((x) => x.developer_id === developerId);
  if (!p) throw new Error(`No placement "${developerId}" in the app`);
  return p.id;
}

export async function findSegmentByTitle(app: string, title: string) {
  const r = await adapty<{ data: SegmentRow[] }>(["segments", "list", "--app", app]);
  return rows(r).find((s) => s.title === title) ?? null;
}

export async function listAbTests(app: string) {
  const r = await adapty<{ data: AbTestRow[] }>(["ab-tests", "list", "--app", app]);
  return rows(r);
}
