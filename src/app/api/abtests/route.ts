import { NextResponse } from "next/server";
import { z } from "zod";
import { appId, listAbTests } from "@/lib/adapty";
import { generate, LlmUnavailable } from "@/lib/llm";
import { CHECKS, checkFacts } from "@/lib/abcheck";

/** GET: the account's A/B tests, read live from Adapty, matched to our checks by title. Read-only. */
export async function GET() {
  try {
    const app = await appId();
    const tests = await listAbTests(app);
    const live = Object.fromEntries(
      CHECKS.map((c) => {
        const t = tests.find((x) => x.title === c.name);
        return [c.name, t ? { state: t.state, startedAt: t.started_at, stoppedAt: t.stopped_at, placement: t.placement?.title ?? null } : null];
      }),
    );
    return NextResponse.json({ live });
  } catch (e) {
    return NextResponse.json({ live: null, error: (e as Error).message }, { status: 503 });
  }
}

const AbCheckSchema = z.object({
  tests: z.array(z.object({ name: z.string(), action: z.string().describe("one or two short sentences: what the growth lead should do now") })),
});

const SYSTEM = `You are the analyst inside Adapty Flywheel. For each A/B test you get a verdict and facts computed in code.
Write the "action": at most 2 short sentences in plain English, telling a growth lead what to do next (re-run, keep, read on a longer window, watch refunds).
Use only the numbers you are given; never invent or round differently. Return one entry per test, with the test name exactly as given.`;

/** POST: the model's plain-English "what to do" for each check (cached on disk after the first run). */
export async function POST() {
  try {
    const facts = checkFacts();
    const r = await generate({ kind: "abcheck", schema: AbCheckSchema, system: SYSTEM, user: facts, maxTokens: 4000 });
    // Every number the model wrote must be one we gave it; anything else is dropped from the screen.
    const known = new Set((facts.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
    const ok = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => known.has(String(Number(n))));
    const actions = Object.fromEntries(r.data.tests.filter((t) => ok(t.action)).map((t) => [t.name, t.action]));
    return NextResponse.json({ actions, model: r.model, cached: r.cached });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
