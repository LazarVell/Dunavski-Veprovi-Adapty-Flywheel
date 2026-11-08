import { NextResponse } from "next/server";
import { getCurrent, saveVisualKey } from "@/lib/campaign-store";
import { generateImage, visualUrl, type Aspect } from "@/lib/visuals";

/**
 * POST { conceptId, aspect?: "portrait" | "square", live? }
 * A new photo for one banner of the current campaign, from its description, recorded on the campaign.
 * Always generates (nothing is reused); the page only asks for pictures a banner doesn't have yet.
 */
export async function POST(req: Request) {
  const { conceptId, aspect = "portrait", live = false } = (await req.json()) as { conceptId: string; aspect?: Aspect; live?: boolean };
  const cur = getCurrent();
  if (!cur) return NextResponse.json({ error: "No campaign yet" }, { status: 400 });
  const concept = cur.campaign.concepts.find((c) => c.id === conceptId);
  if (!concept) return NextResponse.json({ error: `Unknown banner ${conceptId}` }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });
  try {
    const r = await generateImage(concept.visualPrompt, aspect, live);
    // a campaign written meanwhile doesn't get this picture
    if (!saveVisualKey(cur.id, `${concept.id}:${aspect}`, r.key)) return NextResponse.json({ error: "The campaign changed meanwhile" }, { status: 409 });
    return NextResponse.json({ url: visualUrl(r.key), model: r.model, skipped: r.skipped });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
