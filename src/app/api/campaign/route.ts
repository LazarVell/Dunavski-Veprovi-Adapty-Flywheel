import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generate, LlmUnavailable } from "@/lib/llm";
import { CampaignSchema } from "@/lib/schemas";
import { factSheet } from "@/lib/insights";
import { CAMPAIGN_SYSTEM, campaignUser } from "@/lib/prompts";
import { campaignPayload, getCurrent, openPrevious, startCampaign, type StoredCampaign } from "@/lib/campaign-store";
import { appId } from "@/lib/adapty";
import { loadStudioSkill } from "@/lib/studio-skill";

/** The ad paywalls that exist in the Adapty account this machine is logged into (none when the CLI is offline). */
async function adaptyState(cur: StoredCampaign | null) {
  const app = await appId().catch(() => null);
  return { app, adPaywalls: (app && cur?.adPaywalls?.[app]) || {} };
}

export async function GET() {
  const cur = getCurrent();
  // the Creative Studio skill's flow: the steps the page runs after a campaign is written
  const skill = loadStudioSkill();
  return NextResponse.json({ ...(await campaignPayload(cur)), director: { source: skill.source, steps: skill.steps, problems: skill.problems }, adapty: await adaptyState(cur) });
}

/**
 * POST { prompt }: a new campaign, every time (the same prompt twice gives two campaigns). Nothing carries over
 *                  to it, and the campaign it replaces is saved whole, to reopen later.
 * POST { open }:   brings a saved campaign back, with its languages, pictures and edits. No model call.
 */
export async function POST(req: Request) {
  const { prompt, open } = (await req.json()) as { prompt?: string; open?: string };
  if (open !== undefined) {
    const opened = openPrevious(open);
    if (!opened) return NextResponse.json({ error: "That campaign isn't saved on this machine." }, { status: 404 });
    return NextResponse.json({ ...(await campaignPayload(opened)), adapty: await adaptyState(opened) });
  }
  if (!prompt?.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  try {
    const r = await generate({
      kind: "campaign",
      schema: CampaignSchema,
      system: CAMPAIGN_SYSTEM,
      user: campaignUser(prompt.trim(), factSheet()),
    });
    startCampaign({ id: randomUUID(), prompt: prompt.trim(), campaign: r.data, model: r.model, createdAt: new Date().toISOString() });
    return NextResponse.json({ model: r.model, ...(await campaignPayload(getCurrent())) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
