import { NextResponse } from "next/server";
import { generate, LlmUnavailable } from "@/lib/llm";
import { LocalizedSchema, BackCheckSchema, BannerCopySchema, type BackCheck, type Localized } from "@/lib/schemas";
import { LOCALIZE_SYSTEM, localizeUser, localizeBannersUser, BACKCHECK_SYSTEM, ENGLISH_PLANS } from "@/lib/prompts";
import { getCurrent, saveLocale, type SavedLocale, type StoredCampaign } from "@/lib/campaign-store";
import { langByKey, deepTranslit, reviewStatus } from "@/lib/languages";
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

/** The whole campaign in one language, from the model. */
async function writeIn(c: Campaign, langKey: string): Promise<{ data: Localized; model: string }> {
  const lang = langByKey(langKey);
  if (!lang) throw new Error(`Unknown language ${langKey}`);
  const r = await generate({ kind: "localize", schema: LocalizedSchema, system: LOCALIZE_SYSTEM, user: localizeUser(c, lang, lang.key) });
  return { data: r.data, model: r.model };
}

type BannerCopy = { id: string; headline: string; subline: string; cta: string };

/** Only some banners' words, for banners whose English changed after the language was written. */
async function writeBanners(concepts: BannerCopy[], audience: string, langKey: string): Promise<BannerCopy[]> {
  const lang = langByKey(langKey)!;
  const r = await generate({ kind: "localize-banner", schema: BannerCopySchema, system: LOCALIZE_SYSTEM, user: localizeBannersUser(concepts, audience, lang, lang.key) });
  return r.data.concepts;
}

/**
 * A language for the campaign as it is now: written once per campaign and saved with it, so the meaning check
 * and a page reload see the text that is on screen. Banners edited since (`stale`) are re-written on their own.
 * One request per campaign and language at a time: a second one waits for the first.
 */
const inflight = new Map<string, Promise<SavedLocale>>();

function localeFor(snapshot: StoredCampaign, langKey: string): Promise<SavedLocale> {
  const k = `${snapshot.id}:${langKey}`;
  const running = inflight.get(k);
  if (running) return running;
  const job = (async () => {
    // Read again: `snapshot` may predate a save by a parallel request, and this must not write that language twice.
    const latest = getCurrent();
    const cur = latest?.id === snapshot.id ? latest : snapshot;
    // Serbian Latin is never written by the model: it is the Serbian Cyrillic text converted in code, so both scripts always match.
    const writeAs = langByKey(langKey)?.writeAs;
    if (writeAs) {
      const source = await localeFor(cur, writeAs);
      const data = deepTranslit(source.data);
      const prev = getCurrent()?.locales?.[langKey];
      if (prev && !prev.stale?.length && JSON.stringify(prev.data) === JSON.stringify(data)) return prev;
      const converted: SavedLocale = { data, model: source.model };
      saveLocale(cur.id, langKey, converted);
      return converted;
    }
    let saved = cur.locales?.[langKey];
    if (!saved) {
      const w = await writeIn(cur.campaign, langKey);
      saved = { data: w.data, model: w.model };
    } else if (saved.stale?.length) {
      const edited = cur.campaign.concepts.filter((c) => saved!.stale!.includes(c.id)).map(({ id, headline, subline, cta }) => ({ id, headline, subline, cta }));
      const patch = edited.length ? await writeBanners(edited, cur.campaign.brief.audience, langKey) : [];
      const byId = new Map(edited.map((e, i) => [e.id, patch.find((p) => p.id === e.id) ?? patch[i]]));
      const concepts = saved.data.concepts.map((c) => {
        const p = byId.get(c.id);
        return p ? { ...c, headline: p.headline, subline: p.subline, cta: p.cta } : c;
      });
      // the old meaning check was for the old words
      saved = { data: { ...saved.data, concepts }, model: saved.model };
    } else {
      return saved;
    }
    saveLocale(cur.id, langKey, saved);
    return saved;
  })().finally(() => inflight.delete(k));
  inflight.set(k, job);
  return job;
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

/**
 * A language's back-translation check against the English, run once and saved with the language.
 * Pass the language the model actually wrote: Serbian Latin shares Serbian Cyrillic's check, because it is the same text.
 */
const checking = new Map<string, Promise<{ check: BackCheck; model: string }>>();

function meaningCheck(cur: StoredCampaign, writtenKey: string) {
  const k = `${cur.id}:${writtenKey}`;
  const running = checking.get(k);
  if (running) return running;
  const job = (async () => {
    const source = await localeFor(cur, writtenKey);
    if (source.check) return { check: source.check, model: source.checkModel ?? "" };
    const en = linesOf(englishFrom(cur.campaign));
    const pairs = linesOf(source.data).map((l, i) => ({ field: l.field, english: en[i]?.text ?? "", localized: l.text }));
    const r = await generate({
      kind: "backcheck",
      schema: BackCheckSchema,
      system: BACKCHECK_SYSTEM,
      user: `LANGUAGE: ${langByKey(writtenKey)!.name}\n\nPAIRS (JSON):\n${JSON.stringify(pairs, null, 1)}`,
      maxTokens: 8000,
    });
    // keep the check only if the text it checked is still the saved one
    const latest = getCurrent()?.locales?.[writtenKey];
    if (latest && JSON.stringify(latest.data) === JSON.stringify(source.data) && !latest.stale?.length) saveLocale(cur.id, writtenKey, { ...latest, check: r.data, checkModel: r.model });
    return { check: r.data, model: r.model };
  })().finally(() => checking.delete(k));
  checking.set(k, job);
  return job;
}

/**
 * POST { lang }               the campaign in that language (written on first request, then the saved text)
 * POST { lang, check: true }  plus a back-translation check of that same text against the English
 */
export async function POST(req: Request) {
  const { lang: langKey, check } = (await req.json()) as { lang: string; check?: boolean };
  const cur = getCurrent();
  if (!cur) return NextResponse.json({ error: "No campaign yet. Generate one first." }, { status: 400 });
  const lang = langByKey(langKey);
  if (!lang) return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  try {
    if (lang.key === "en") {
      return NextResponse.json({ lang: "en", localized: englishFrom(cur.campaign), model: cur.model ?? "", reviewStatus: reviewStatus(lang, false), backCheck: null });
    }
    const saved = await localeFor(cur, lang.key);
    const result = check ? await meaningCheck(cur, lang.writeAs ?? lang.key) : null;
    return NextResponse.json({
      lang: lang.key,
      localized: saved.data,
      model: saved.model,
      checkModel: result?.model ?? null,
      reviewStatus: reviewStatus(lang, !!result),
      backCheck: result?.check ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailable ? 503 : 500 });
  }
}
