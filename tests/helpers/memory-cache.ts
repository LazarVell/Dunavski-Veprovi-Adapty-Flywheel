/**
 * In-memory stand-in for src/lib/cache.ts, so tests never touch data/demo-cache.
 * Use it with: vi.mock("@/lib/cache", () => import("../helpers/memory-cache"));
 */
import crypto from "node:crypto";

const json = new Map<string, string>();
const bin = new Map<string, Buffer>();
const id = (bucket: string, key: string, ext = "json") => `${bucket}/${key}.${ext}`;

export const CACHE_DIR = "/memory";

export const hashKey = (...parts: unknown[]) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);

export function readCache<T>(bucket: string, key: string): T | null {
  const v = json.get(id(bucket, key));
  return v === undefined ? null : (JSON.parse(v) as T);
}

// through JSON, like the real file: `undefined` fields disappear
export function writeCache(bucket: string, key: string, value: unknown) {
  json.set(id(bucket, key), JSON.stringify(value));
}

export const readBinary = (bucket: string, key: string, ext: string) => bin.get(id(bucket, key, ext)) ?? null;
export const hasBinary = (bucket: string, key: string, ext: string) => bin.has(id(bucket, key, ext));
export function writeBinary(bucket: string, key: string, ext: string, data: Buffer) {
  bin.set(id(bucket, key, ext), data);
}

export function resetMemory() {
  json.clear();
  bin.clear();
}
