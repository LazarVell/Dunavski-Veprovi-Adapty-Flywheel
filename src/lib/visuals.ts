import "server-only";
import { toFile } from "openai";
import sharp from "sharp";
import crypto from "node:crypto";
import { hashKey, hasBinary, readBinary, writeBinary } from "./cache";
import { openai, withFallback } from "./llm";
import type { Concept } from "./schemas";
import type { StoredCampaign } from "./campaign-store";

/**
 * Text-free banner visuals from the OpenAI image API.
 * Generated once per concept and aspect, then reused for every language: all text is overlaid in HTML.
 * Cached: best quality ahead of time. Live: faster, for generation on stage. Each falls back down its chain.
 */
const MODEL_CACHED = process.env.OPENAI_IMAGE_MODEL_CACHED || "gpt-image-2.6-sunburst";
const MODEL_LIVE = process.env.OPENAI_IMAGE_MODEL_LIVE || "gpt-image-2.6-flare";
const IMAGE_FALLBACKS = (process.env.OPENAI_IMAGE_FALLBACKS || "gpt-image-2.5-sunburst,gpt-image-2,gpt-image-1.5").split(",").map((s) => s.trim());
const chain = (first: string, second: string) => [...new Set([first, second, ...IMAGE_FALLBACKS])];
const modelsFor = (live: boolean) => (live ? chain(MODEL_LIVE, MODEL_CACHED) : chain(MODEL_CACHED, MODEL_LIVE));
const QUALITY = (process.env.OPENAI_IMAGE_QUALITY || "high") as "high";

export const SIZES = { portrait: process.env.OPENAI_IMAGE_SIZE_PORTRAIT || "1024x1536", square: "1024x1024" } as const;
export const ASPECTS = ["portrait", "square"] as const;
export type Aspect = (typeof ASPECTS)[number];

const STYLE = `Photorealistic, natural light, shot on a modern phone, clean composition with calm empty space in the top third for a headline overlay.
Absolutely no text, letters, numbers, captions, logos, watermarks, borders, phone frames or app UI anywhere in the image.`;

const EDIT_STYLE = `Change only what is asked. Keep everything else in the photo as it is: framing, subject, light, and the calm empty space in the top third.
Absolutely no text, letters, numbers, captions, logos, watermarks, borders, phone frames or app UI anywhere in the image.`;

/** Where older campaigns kept a photo: keyed by its description. New photos get a key of their own (`newKey`). */
export const promptKey = (prompt: string, aspect: Aspect) => hashKey("visual", prompt, aspect);
/** A fresh image key (16 hex, the shape /api/visual/[key] serves). */
const newKey = () => crypto.randomBytes(8).toString("hex");
export const visualUrl = (key: string) => `/api/visual/${key}`;
export const hasImage = (key: string) => hasBinary("images", key, "jpg");

function b64Of(res: { data?: { b64_json?: string }[] }) {
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image API returned no image");
  return b64;
}

/** A new photo from a description, every time. The caller records its key on the campaign. */
export async function generateImage(prompt: string, aspect: Aspect, live = false) {
  const key = newKey();
  const { result, model, skipped } = await withFallback(modelsFor(live), async (model) =>
    b64Of(
      await openai().images.generate({
        model,
        prompt: `${prompt}\n\n${STYLE}`,
        size: SIZES[aspect],
        quality: QUALITY,
        output_format: "jpeg",
        output_compression: 88,
        n: 1,
      }),
    ),
  );
  writeBinary("images", key, "jpg", Buffer.from(result, "base64"));
  return { key, model, skipped };
}

/** Changes an existing photo as asked and keeps the rest. A new image every time. */
export async function editImage(sourceKey: string, instruction: string, aspect: Aspect, live = false) {
  const key = newKey();
  const src = readBinary("images", sourceKey, "jpg");
  if (!src) throw new Error("The banner's picture is missing from the cache");
  const { result, model } = await withFallback(modelsFor(live), async (model) =>
    b64Of(
      await openai().images.edit({
        model,
        image: await toFile(src, "banner.jpg", { type: "image/jpeg" }),
        prompt: `${instruction}\n\n${EDIT_STYLE}`,
        size: SIZES[aspect],
        quality: QUALITY,
        output_format: "jpeg",
        output_compression: 88,
        n: 1,
      }),
    ),
  );
  writeBinary("images", key, "jpg", Buffer.from(result, "base64"));
  return { key, model };
}

/** The photo a banner shows: the one recorded on the campaign (older campaigns: the one stored under its description). */
export const visualKeyFor = (cur: StoredCampaign, c: Concept, aspect: Aspect) =>
  cur.visualKeys?.[`${c.id}:${aspect}`] ?? promptKey(c.visualPrompt, aspect);

/**
 * The paywall's version of a banner photo: a 2:1 crop around the people.
 * Ad photos keep their top third empty for the headline, and Adapty's image element has no focal point
 * (`cover` fills from the top), so the square photo showed only empty sky there. This crop is what
 * gets uploaded, and the element hugs it, so Adapty draws exactly this picture.
 */
export async function heroCrop(squareKey: string) {
  const key = hashKey("hero", squareKey, "2:1");
  if (hasImage(key)) return key;
  const src = readBinary("images", squareKey, "jpg");
  if (!src) return null;
  const out = await sharp(src)
    .resize(1024, 512, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 88 })
    .toBuffer();
  writeBinary("images", key, "jpg", out);
  return key;
}

/**
 * URLs of every banner photo that exists, keyed `${conceptId}:${aspect}` (null = not generated yet),
 * plus `${conceptId}:hero`, the paywall crop of the square one.
 */
export async function visualUrls(cur: StoredCampaign) {
  const out: Record<string, string | null> = {};
  for (const c of cur.campaign.concepts) {
    for (const a of ASPECTS) {
      const k = visualKeyFor(cur, c, a);
      out[`${c.id}:${a}`] = hasImage(k) ? visualUrl(k) : null;
    }
    const sq = visualKeyFor(cur, c, "square");
    const hero = hasImage(sq) ? await heroCrop(sq).catch(() => null) : null;
    out[`${c.id}:hero`] = hero ? visualUrl(hero) : null;
  }
  return out;
}
