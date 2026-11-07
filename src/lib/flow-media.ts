import "server-only";
import { adapty, unwrap, withTempFile, withTempJson } from "./adapty";
import { readBinary, readCache, writeCache } from "./cache";
import type { HeroImage } from "./flow";
import { heroCrop } from "./visuals";

/**
 * The ad's visual on Adapty's CDN. Uploaded once per app and image: `flows media upload` doesn't deduplicate,
 * and its preview thumbnail comes back from that one call only, so the result is kept on disk.
 */
export async function heroFor(app: string, visualUrl: string | undefined): Promise<HeroImage | null> {
  const square = visualUrl?.match(/^\/api\/visual\/([a-f0-9]{16})$/)?.[1];
  // The flow gets the 2:1 crop around the people, not the ad's square photo with its empty headline space.
  const key = square ? await heroCrop(square) : null;
  if (!key) return null;
  const cacheKey = `media-${app}-${key}`;
  const hit = readCache<HeroImage>("adapty", cacheKey);
  if (hit) return hit;
  const bytes = readBinary("images", key, "jpg");
  if (!bytes) return null;
  const up = unwrap(
    await withTempFile(bytes, "jpg", (f) => adapty<{ id: string | number; url: string; preview_base64?: string }>(["flows", "media", "upload", f, "--app", app])),
  );
  const hero: HeroImage = { id: String(up.id), url: up.url, previewValue: up.preview_base64 || undefined };
  writeCache("adapty", cacheKey, hero);
  return hero;
}

/** Adapty's own render of a config, so the demo shows the flow as the device will (read-only). */
export async function renderUrl(config: unknown) {
  try {
    const r = await withTempJson(config, (f) => adapty<{ render_url?: string; url?: string }>(["flows", "config", "preview", f]));
    return r.render_url ?? r.url ?? null;
  } catch {
    return null;
  }
}
