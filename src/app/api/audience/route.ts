import { NextResponse } from "next/server";
import { adapty, appId, findFlowByName, findSegmentByTitle, listAbTests, placementIdByDevId, unwrap } from "@/lib/adapty";
import { getCurrent, saveAdPaywall } from "@/lib/campaign-store";
import { abTestTitle, segmentTitle } from "@/lib/ads";

const BASE_FLOW_NAME = process.env.ADAPTY_BASE_FLOW_NAME || "Main - 3 plans";
const TEST_PLACEMENT = process.env.ADAPTY_TEST_PLACEMENT || "main";

/**
 * POST { conceptId, step: "segment" | "abtest" }
 * segment: an Adapty segment of the users whose attribution creative is this ad's name.
 * abtest:  a DRAFT A/B test on the Main placement for that segment: current paywall vs this ad's paywall.
 * Both are reused by title if they exist. Nothing is started or published.
 */
export async function POST(req: Request) {
  const { conceptId, step } = (await req.json()) as { conceptId: string; step: "segment" | "abtest" };
  const cur = getCurrent();
  if (!cur) return NextResponse.json({ error: "No campaign yet" }, { status: 400 });
  const concept = cur.campaign.concepts.find((c) => c.id === conceptId);
  if (!concept) return NextResponse.json({ error: `Unknown ad ${conceptId}` }, { status: 400 });

  try {
    const app = await appId();
    const pw = cur.adPaywalls?.[app]?.[conceptId];
    if (!pw) return NextResponse.json({ error: "Create this ad's paywall first" }, { status: 400 });

    if (step === "segment") {
      const title = segmentTitle(pw.adName);
      let seg = await findSegmentByTitle(app, title);
      const reused = !!seg;
      if (!seg) {
        seg = unwrap(
          await adapty<{ id: string; title: string } | { data: { id: string; title: string } }>([
            "segments", "create", "--app", app, "--title", title,
            "--description", `Installs from the ad "${pw.adName}" (attribution creative). Made by Flywheel.`,
            "--filter", `creative:IN:${pw.adName}`,
          ]),
        );
      }
      const next = { ...pw, segmentId: seg.id, segmentTitle: title, updatedAt: new Date().toISOString() };
      saveAdPaywall(app, next);
      return NextResponse.json({ reused, ...next });
    }

    if (!pw.segmentId) return NextResponse.json({ error: "Create the segment first" }, { status: 400 });
    const title = abTestTitle(concept.name);
    const existing = (await listAbTests(app)).find((t) => t.title === title);
    if (existing) {
      const next = { ...pw, abTestId: existing.ab_test_id, abTestTitle: title, abTestError: undefined, updatedAt: new Date().toISOString() };
      saveAdPaywall(app, next);
      return NextResponse.json({ reused: true, state: existing.state, ...next });
    }
    const [placement, baseFlow] = await Promise.all([placementIdByDevId(app, TEST_PLACEMENT), findFlowByName(app, BASE_FLOW_NAME)]);
    if (!baseFlow) return NextResponse.json({ error: `No flow named "${BASE_FLOW_NAME}"` }, { status: 400 });
    try {
      const t = unwrap(
        await adapty<{ ab_test_id: string }>([
          "ab-tests", "create", "--app", app, "--title", title, "--placement", placement, "--segment", pw.segmentId,
          "--goal", `Does the paywall that repeats the "${concept.name}" ad convert its installs better than the current one?`,
          "--flows", JSON.stringify([
            { flow_id: baseFlow.id, weight: 50, title: "A current" },
            { flow_id: pw.flowId, weight: 50, title: "B matched" },
          ]),
        ]),
      );
      const next = { ...pw, abTestId: t.ab_test_id, abTestTitle: title, abTestError: undefined, updatedAt: new Date().toISOString() };
      saveAdPaywall(app, next);
      return NextResponse.json({ reused: false, state: "draft", ...next });
    } catch (e) {
      // Adapty only puts published flows into tests. We never publish, so say so plainly and stop here.
      const raw = (e as Error).message;
      const msg = /must be published/i.test(raw)
        ? "Adapty only adds published flows to a test. Publishing it shows it to no one until a test or placement uses it. Publish the flow in Adapty, then click again."
        : raw.match(/"message":\s*"([^"]+)"/)?.[1] ?? raw;
      const next = { ...pw, abTestError: msg, updatedAt: new Date().toISOString() };
      saveAdPaywall(app, next);
      return NextResponse.json({ error: msg, ...next }, { status: 422 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
