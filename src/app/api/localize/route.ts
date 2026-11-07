import { NextResponse } from "next/server";
import { generate, LlmUnavailable } from "@/lib/llm";
import { LocalizedSchema, BackCheckSchema, type Localized } from "@/lib/schemas";
import { LOCALIZE_SYSTEM, localizeUser, BACKCHECK_SYSTEM, ENGLISH_PLANS } from "@/lib/prompts";
import { getCurrent } from "@/lib/campaign-store";
import { langByKey, deepTranslit, needsReview } from "@/lib/languages";
import type { Campaign } from "@/lib/schemas";

/** English is the master itself; other languages are written by the model from it. */
function englishFrom(c: Campaign): Localized {
  return {
    concepts: c.concepts.map(({ id, headline, subline, cta }) => ({ id, headline, subline, cta })),
    adCopy: c.adCopy,
    videoScript: c.videoScript,
    paywall: {
      ...c.paywall,
      plans: ENGLISH_PLANS,
      terms: "Terms",
      privacy: "Privacy",
    },
  };
}

async function writeIn(c: Campaign, langKey: string, fresh?: boolean, campaignModel = ""): Promise<{ data: Localized; cached: boolean; model: string }> {
  const lang = langByKey(langKey);
  if (!lang) throw new Error(`Unknown language ${langKey}`);
  if (lang.key === "en") return { data: englishFrom(c), cached: true, model: campaignModel };
  // Serbian Latin is generated in Cyrillic and converted in code, so both scripts always match.
  if (lang.writeAs === "sr-Cyrl") {
    const cyr = await writeIn(c, "sr-Cyrl", fresh);
    return { data: deepTranslit(cyr.data), cached: cyr.cached, model: cyr.model };
  }
  const r = await generate({
    kind: "localize",
    schema: LocalizedSchema,
    system: LOCALIZE_SYSTEM,
    user: localizeUser(c, lang, lang.key),
    fresh,
  });
  return { data: r.data, cached: r.cached, model: r.model };
}

function linesOf(l: Localized) {
  return [
    ...l.concepts.flatMap((x) => [
      { field: `${x.id} headline`, text: x.headline },
      { field: `${x.id} subline`, text: x.subline },
      { field: `${x.id} cta`, text: x.cta },
    ]),
    ...l.adCopy.flatMap((x, i) => [
      { field: `ad ${i + 1} headline`, text: x.headline },
      { field: `ad ${i + 1} primary text`, text: x.primaryText },
    ]),
    { field: "paywall headline", text: l.paywall.headline },
    { field: "paywall subtitle", text: l.paywall.subtitle },
    { field: "paywall cta", text: l.paywall.cta },
    { field: "video hook", text: l.videoScript.hook },
  ];
}

export async function POST(req: Request) {
  const { lang: langKey, fresh, check } = (await req.json()) as { lang: string; fresh?: boolean; check?: boolean };
  const cur = getCurrent();
  if (!cur) return NextResponse.json({ error: "No campaign yet. Generate one first." }, { status: 400 });
  const lang = langByKey(langKey);
  if (!lang) return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  try {
    const out = await writeIn(cur.campaign, langKey, fresh, cur.model);
    let backCheck = null;
    let checkModel: string | null = null;
    if (check && lang.key !== "en") {
      const en = linesOf(englishFrom(cur.campaign));
      const loc = linesOf(out.data);
      const pairs = loc.map((l, i) => ({ field: l.field, english: en[i]?.text ?? "", localized: l.text }));
      const r = await generate({
        kind: "backcheck",
        schema: BackCheckSchema,
        system: BACKCHECK_SYSTEM,
        user: `LANGUAGE: ${lang.name}\n\nPAIRS (JSON):\n${JSON.stringify(pairs, null, 1)}`,
        maxTokens: 8000,
      });
      backCheck = r.data;
      checkModel = r.model;
    }
    return NextResponse.json({
      lang: lang.key,
      localized: out.data,
      cached: out.cached,
      model: out.model,
      checkModel,
      reviewStatus: needsReview(lang) ? "needs_native_review" : "checked",
      backCheck,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
