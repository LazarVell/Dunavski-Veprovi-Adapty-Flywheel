import { NextResponse } from "next/server";
import { generate, LlmUnavailable } from "@/lib/llm";
import { CampaignSchema } from "@/lib/schemas";
import { factSheet } from "@/lib/insights";
import { CAMPAIGN_SYSTEM, campaignUser } from "@/lib/prompts";
import { getCurrent, setCurrent } from "@/lib/campaign-store";

/** Every number the model wrote in the brief must appear in the fact sheet we gave it. Returns the ones that don't. */
function unverifiedNumbers(lines: string[]) {
  const facts = factSheet();
  const known = new Set((facts.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  const bad = new Set<string>();
  for (const line of lines) {
    for (const n of line.match(/\d+(?:\.\d+)?/g) ?? []) {
      const v = String(Number(n));
      // ignore small counts and ranges like "5-7" / "5+" that come from bucket labels
      if (Number(n) <= 13 && Number.isInteger(Number(n)) && !n.includes(".")) continue;
      if (!known.has(v)) bad.add(n);
    }
  }
  return [...bad];
}

const withCheck = <T extends { campaign: { brief: { why: string[]; avoid: string[] } } } | null>(c: T) =>
  c ? { ...c, unverified: unverifiedNumbers([...c.campaign.brief.why, ...c.campaign.brief.avoid]) } : c;

export async function GET() {
  return NextResponse.json({ current: withCheck(getCurrent()) });
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
    setCurrent(prev?.id === r.key ? { ...prev, campaign: r.data, model: r.model } : stored);
    return NextResponse.json({ ...r, current: withCheck(getCurrent()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
