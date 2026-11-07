import { NextResponse } from "next/server";
import { generateImage, hasImage, promptKey, visualUrl, type Aspect } from "@/lib/visuals";

/** A banner photo from its description: the cached one, or a new one (see lib/visuals). */
export async function POST(req: Request) {
  const { prompt, aspect = "portrait", live = false, cacheOnly = false, fresh = false } = (await req.json()) as {
    prompt: string; aspect?: Aspect; live?: boolean; cacheOnly?: boolean; fresh?: boolean;
  };
  const key = promptKey(prompt, aspect);
  if (!fresh && hasImage(key)) return NextResponse.json({ url: visualUrl(key), cached: true });
  if (cacheOnly) return NextResponse.json({ url: null });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });
  try {
    const r = await generateImage(prompt, aspect, live);
    return NextResponse.json({ url: visualUrl(r.key), cached: false, model: r.model, skipped: r.skipped });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
