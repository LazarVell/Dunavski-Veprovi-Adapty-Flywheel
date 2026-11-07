import { NextResponse } from "next/server";
import { adapty, appId, findFlowByName, listAbTests, placementIdByDevId, publishFlow, unwrap, withTempJson } from "@/lib/adapty";
import { heroFor, renderUrl } from "@/lib/flow-media";
import { buildOnboardingDraft } from "@/lib/flow";
import { getCurrent, saveAdPaywall } from "@/lib/campaign-store";
import { onboardingFlowName, onbTestTitle } from "@/lib/ads";

const BASE_ONB_NAME = process.env.ADAPTY_BASE_ONBOARDING_NAME || "Onboarding - Weekly first";
const ONB_PLACEMENT = process.env.ADAPTY_ONBOARDING_PLACEMENT || "onboarding";

/**
 * POST { conceptId, step: "flow" | "publish" | "abtest", headline?, subline?, visualUrl? }
 * flow:    a DRAFT onboarding flow named after the ad: Lumen's onboarding with the ad's picture, headline and subline
 *          on the welcome screen. Reused by name if it exists; published only by the publish step.
 * publish: publishes that flow. Adapty only puts published flows into tests; a flow that no placement or running
 *          test uses is shown to no one, so this changes nothing users see.
 * abtest: a DRAFT A/B test on the onboarding placement for this ad's segment: current onboarding vs the matched one.
 * Needs the ad's paywall and segment first (the segment is what limits the test to this ad's users).
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { conceptId: string; step: "flow" | "publish" | "abtest"; headline?: string; subline?: string; visualUrl?: string };
  const cur = getCurrent();
  if (!cur) return NextResponse.json({ error: "No campaign yet" }, { status: 400 });
  const concept = cur.campaign.concepts.find((c) => c.id === body.conceptId);
  if (!concept) return NextResponse.json({ error: `Unknown ad ${body.conceptId}` }, { status: 400 });

  try {
    const app = await appId();
    const pw = cur.adPaywalls?.[app]?.[concept.id];
    if (!pw) return NextResponse.json({ error: "Create this ad's paywall first" }, { status: 400 });
    const base = await findFlowByName(app, BASE_ONB_NAME);
    if (!base) return NextResponse.json({ error: `No flow named "${BASE_ONB_NAME}"` }, { status: 400 });

    if (body.step === "flow") {
      const env = await adapty<{ config: never }>(["flows", "config", "get", base.id, "--app", app]);
      const hero = await heroFor(app, body.visualUrl);
      const draft = buildOnboardingDraft(
        env.config,
        { headline: body.headline || concept.headline, subline: body.subline || concept.subline },
        hero ?? undefined,
      );
      if (draft.replaced < 2) return NextResponse.json({ error: `The welcome screen of "${BASE_ONB_NAME}" no longer has the lines we replace` }, { status: 422 });

      let validation = "publishable";
      try {
        await withTempJson(draft.config, (f) => adapty(["flows", "config", "validate", base.id, "--app", app, "--config-file", f]));
      } catch (e) {
        validation = `not publishable: ${(e as Error).message}`;
      }

      const name = onboardingFlowName(cur.campaign.name, concept.name);
      const existing = await findFlowByName(app, name);
      let flowId = existing?.id;
      if (!flowId) {
        const created = await adapty<{ id?: string; data?: { id: string } }>(["flows", "create", "--app", app, "--name", name]);
        flowId = created.id ?? created.data?.id;
        if (!flowId) return NextResponse.json({ error: "flows create returned no id", created }, { status: 502 });
      }
      const written = unwrap(
        await withTempJson(draft.config, (f) => adapty<{ builder_url?: string }>(["flows", "config", "update", flowId!, "--app", app, "--config-file", f])),
      );
      const next = {
        ...pw, onbFlowId: flowId, onbFlowName: name, onbValidation: validation,
        onbRenderUrl: await renderUrl(draft.config), onbBuilderUrl: written?.builder_url ?? pw.onbBuilderUrl ?? null,
        // a new config is not live until it is published again
        onbConfigAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveAdPaywall(app, next);
      return NextResponse.json({ reused: !!existing, heroAdded: draft.heroAdded, ...next });
    }

    if (!pw.onbFlowId) return NextResponse.json({ error: "Create the onboarding first" }, { status: 400 });

    if (body.step === "publish") {
      try {
        await publishFlow(app, pw.onbFlowId);
        const next = { ...pw, onbPublishedAt: new Date().toISOString(), onbPublishError: undefined, onbTestError: undefined, updatedAt: new Date().toISOString() };
        saveAdPaywall(app, next);
        return NextResponse.json(next);
      } catch (e) {
        const next = { ...pw, onbPublishError: (e as Error).message, updatedAt: new Date().toISOString() };
        saveAdPaywall(app, next);
        return NextResponse.json({ error: (e as Error).message, ...next }, { status: 502 });
      }
    }

    if (!pw.segmentId) return NextResponse.json({ error: "Create the segment first" }, { status: 400 });
    const title = onbTestTitle(concept.name);
    const existing = (await listAbTests(app)).find((t) => t.title === title);
    if (existing) {
      const next = { ...pw, onbTestId: existing.ab_test_id, onbTestTitle: title, onbTestError: undefined, updatedAt: new Date().toISOString() };
      saveAdPaywall(app, next);
      return NextResponse.json({ reused: true, state: existing.state, ...next });
    }
    const placement = await placementIdByDevId(app, ONB_PLACEMENT);
    try {
      const t = unwrap(
        await adapty<{ ab_test_id: string }>([
          "ab-tests", "create", "--app", app, "--title", title, "--placement", placement, "--segment", pw.segmentId,
          "--goal", `Does an onboarding that opens with the "${concept.name}" ad convert its installs better than the current one?`,
          "--flows", JSON.stringify([
            { flow_id: base.id, weight: 50, title: "A current" },
            { flow_id: pw.onbFlowId, weight: 50, title: "B matched" },
          ]),
        ]),
      );
      const next = { ...pw, onbTestId: t.ab_test_id, onbTestTitle: title, onbTestError: undefined, updatedAt: new Date().toISOString() };
      saveAdPaywall(app, next);
      return NextResponse.json({ reused: false, state: "draft", ...next });
    } catch (e) {
      // Adapty only puts published flows into tests (e.g. the draft was updated after it was published).
      const raw = (e as Error).message;
      const msg = /must be published/i.test(raw)
        ? "Adapty only adds published flows to a test. Publish this ad's onboarding (the step above), then click again."
        : raw.match(/"message":\s*"([^"]+)"/)?.[1] ?? raw;
      const next = { ...pw, onbTestError: msg, updatedAt: new Date().toISOString() };
      saveAdPaywall(app, next);
      return NextResponse.json({ error: msg, ...next }, { status: 422 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
