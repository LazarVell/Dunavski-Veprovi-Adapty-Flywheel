import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Local storage under data/demo-cache/ (git-ignored): the current campaign with its languages and checks,
 * generated images, and records of what was uploaded to Adapty (uploads don't deduplicate there).
 * Model results are NOT cached by their inputs: every request asks the model again (src/lib/llm.ts).
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

export const hasBinary = (bucket: string, key: string, ext: string) => fs.existsSync(file(bucket, key, ext));

export function writeBinary(bucket: string, key: string, ext: string, data: Buffer) {
  fs.mkdirSync(path.join(CACHE_DIR, bucket), { recursive: true });
  fs.writeFileSync(file(bucket, key, ext), data);
}
