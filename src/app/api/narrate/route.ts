import { NextResponse } from "next/server";
import { generate, LlmUnavailable } from "@/lib/llm";
import { NarrationSchema } from "@/lib/schemas";
import { CARDS } from "@/lib/insights";
import { NARRATE_SYSTEM } from "@/lib/prompts";

export async function POST(req: Request) {
  const { fresh } = await req.json().catch(() => ({ fresh: false }));
  const user = CARDS.map((c) => `CARD ${c.id}: ${c.headline}\n${c.facts.map((f) => "- " + f).join("\n")}`).join("\n\n");
  try {
    const r = await generate({ kind: "narrate", schema: NarrationSchema, system: NARRATE_SYSTEM, user, fresh, maxTokens: 4000 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
