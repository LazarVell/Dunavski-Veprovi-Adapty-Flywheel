import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Demo cache: every generated result (model JSON, images, created flows) is written under
 * data/demo-cache/ and committed, so the demo replays instantly and runs without API keys.
 * Pass `fresh: true` to a route to bypass it.
 */
export const CACHE_DIR = path.join(process.cwd(), "data", "demo-cache");

export const hashKey = (...parts: unknown[]) =>
  crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);

const file = (bucket: string, key: string, ext = "json") => path.join(CACHE_DIR, bucket, `${key}.${ext}`);

export function readCache<T>(bucket: string, key: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file(bucket, key), "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeCache(bucket: string, key: string, value: unknown) {
  fs.mkdirSync(path.join(CACHE_DIR, bucket), { recursive: true });
  fs.writeFileSync(file(bucket, key), JSON.stringify(value, null, 1));
}

export function readBinary(bucket: string, key: string, ext: string): Buffer | null {
  try {
    return fs.readFileSync(file(bucket, key, ext));
  } catch {
    return null;
  }
}

export function writeBinary(bucket: string, key: string, ext: string, data: Buffer) {
  fs.mkdirSync(path.join(CACHE_DIR, bucket), { recursive: true });
  fs.writeFileSync(file(bucket, key, ext), data);
}
