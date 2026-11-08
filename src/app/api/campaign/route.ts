import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generate, LlmUnavailable } from "@/lib/llm";
import { CampaignSchema } from "@/lib/schemas";
import { factSheet } from "@/lib/insights";
import { CAMPAIGN_SYSTEM, campaignUser } from "@/lib/prompts";
import { campaignPayload, getCurrent, setCurrent } from "@/lib/campaign-store";
import { appId } from "@/lib/adapty";
import { loadStudioSkill } from "@/lib/studio-skill";

export async function GET() {
  // The ad paywalls that exist in the Adapty account this machine is logged into (none when the CLI is offline).
  const app = await appId().catch(() => null);
  const cur = getCurrent();
  // the Creative Studio skill's flow: the steps the page runs after a campaign is written
  const skill = loadStudioSkill();
  return NextResponse.json({ ...(await campaignPayload(cur)), director: { source: skill.source, steps: skill.steps, problems: skill.problems }, adapty: { app, adPaywalls: (app && cur?.adPaywalls?.[app]) || {} } });
}

/**
 * POST { prompt }: a new campaign, every time (the same prompt twice gives two campaigns).
 * It replaces the current one, with nothing carried over: no languages, pictures, banner edits or ad state.
 */
export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt: string };
  if (!prompt?.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  try {
    const r = await generate({
      kind: "campaign",
      schema: CampaignSchema,
      system: CAMPAIGN_SYSTEM,
      user: campaignUser(prompt.trim(), factSheet()),
    });
    setCurrent({ id: randomUUID(), prompt: prompt.trim(), campaign: r.data, model: r.model, createdAt: new Date().toISOString() });
    return NextResponse.json({ model: r.model, ...(await campaignPayload(getCurrent())) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
