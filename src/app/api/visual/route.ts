import { NextResponse } from "next/server";
import { hashKey, readBinary, writeBinary } from "@/lib/cache";
import { openai, withFallback } from "@/lib/llm";

/**
 * Text-free banner visuals from the OpenAI image API.
 * Generated once per concept and aspect, then reused for every language: all text is overlaid in HTML.
 * Cached: best quality ahead of time. Live: faster, for generation on stage. Each falls back down its chain.
 */
const MODEL_CACHED = process.env.OPENAI_IMAGE_MODEL_CACHED || "gpt-image-2.6-sunburst";
const MODEL_LIVE = process.env.OPENAI_IMAGE_MODEL_LIVE || "gpt-image-2.6-flare";
const IMAGE_FALLBACKS = (process.env.OPENAI_IMAGE_FALLBACKS || "gpt-image-2.5-sunburst,gpt-image-2,gpt-image-1.5").split(",").map((s) => s.trim());
const chain = (first: string, second: string) => [...new Set([first, second, ...IMAGE_FALLBACKS])];
const QUALITY = (process.env.OPENAI_IMAGE_QUALITY || "high") as "high";
const SIZES = { portrait: process.env.OPENAI_IMAGE_SIZE_PORTRAIT || "1024x1536", square: "1024x1024" } as const;

const STYLE = `Photorealistic, natural light, shot on a modern phone, clean composition with calm empty space in the top third for a headline overlay.
Absolutely no text, letters, numbers, captions, logos, watermarks, borders, phone frames or app UI anywhere in the image.`;

export async function POST(req: Request) {
  const { prompt, aspect = "portrait", live = false, cacheOnly = false, fresh = false } = (await req.json()) as {
    prompt: string; aspect?: keyof typeof SIZES; live?: boolean; cacheOnly?: boolean; fresh?: boolean;
  };
  // Cache key ignores the model so a cached Sunburst visual is reused even when "live" is on.
  const key = hashKey("visual", prompt, aspect);
  if (!fresh && readBinary("images", key, "jpg")) return NextResponse.json({ url: `/api/visual/${key}`, cached: true });
  if (cacheOnly) return NextResponse.json({ url: null });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });

  const models = live ? chain(MODEL_LIVE, MODEL_CACHED) : chain(MODEL_CACHED, MODEL_LIVE);
  try {
    const { result: b64, model, skipped } = await withFallback(models, async (model) => {
      const res = await openai().images.generate({
        model,
        prompt: `${prompt}\n\n${STYLE}`,
        size: SIZES[aspect],
        quality: QUALITY,
        output_format: "jpeg",
        output_compression: 88,
        n: 1,
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("Image API returned no image");
      return b64;
    });
    writeBinary("images", key, "jpg", Buffer.from(b64, "base64"));
    return NextResponse.json({ url: `/api/visual/${key}`, cached: false, model, skipped });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
