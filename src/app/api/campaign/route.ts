import { NextResponse } from "next/server";
import { generate, LlmUnavailable } from "@/lib/llm";
import { CampaignSchema } from "@/lib/schemas";
import { factSheet } from "@/lib/insights";
import { CAMPAIGN_SYSTEM, campaignUser } from "@/lib/prompts";
import { campaignPayload, getCurrent, setCurrent } from "@/lib/campaign-store";
import { appId } from "@/lib/adapty";

export async function GET() {
  // The ad paywalls that exist in the Adapty account this machine is logged into (none when the CLI is offline).
  const app = await appId().catch(() => null);
  const cur = getCurrent();
  return NextResponse.json({ ...(await campaignPayload(cur)), adapty: { app, adPaywalls: (app && cur?.adPaywalls?.[app]) || {} } });
}

export async function POST(req: Request) {
  const { prompt, fresh } = (await req.json()) as { prompt: string; fresh?: boolean };
  if (!prompt?.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  try {
    const r = await generate({
      kind: "campaign",
      schema: CampaignSchema,
      system: CAMPAIGN_SYSTEM,
      user: campaignUser(prompt.trim(), factSheet()),
      fresh,
    });
    const stored = { id: r.key, prompt: prompt.trim(), campaign: r.data, model: r.model, createdAt: new Date().toISOString() };
    const prev = getCurrent();
    if (prev?.id !== r.key) setCurrent(stored);
    // Same campaign back from the cache: keep its banner edits.
    else if (!fresh) setCurrent({ ...prev, model: r.model });
    // Rewritten from scratch: banner edits belonged to the old words; the ads' Adapty state stays.
    else setCurrent({ ...stored, adPaywalls: prev.adPaywalls, paywallFlow: prev.paywallFlow });
    return NextResponse.json({ ...r, ...(await campaignPayload(getCurrent())) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
