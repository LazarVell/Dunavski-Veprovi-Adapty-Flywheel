import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { adapty, appId, findFlowByName, unwrap, withTempFile, withTempJson } from "@/lib/adapty";
import { buildPaywallDraft, type HeroImage, type LocaleInput } from "@/lib/flow";
import { getCurrent, saveAdPaywall } from "@/lib/campaign-store";
import { readBinary, readCache, writeCache } from "@/lib/cache";
import { langByKey } from "@/lib/languages";
import { adName, paywallFlowName, type AdPaywall } from "@/lib/ads";
import type { Localized } from "@/lib/schemas";

const BASE_FLOW_NAME = process.env.ADAPTY_BASE_FLOW_NAME || "Main - 3 plans";

async function baseConfig(app: string | null) {
  try {
    if (!app) throw new Error("Adapty app not found");
    const row = await findFlowByName(app, BASE_FLOW_NAME);
    if (!row) throw new Error(`No flow named "${BASE_FLOW_NAME}" in the app`);
    const env = await adapty<{ config: never }>(["flows", "config", "get", row.id, "--app", app]);
    return { config: env.config, baseFlowId: row.id, source: "live" as const };
  } catch (e) {
    // Offline fallback: the seed kit's flow file (placeholder product ids; fine for preview, not for creation)
    const file = path.join(process.cwd(), "data", "derived", "paywall-base.flow.json");
    return { config: JSON.parse(fs.readFileSync(file, "utf8")), baseFlowId: null, source: "offline" as const, error: (e as Error).message };
  }
}

/**
 * The ad's visual on Adapty's CDN. Uploaded once per app and image: `flows media upload` doesn't deduplicate,
 * and its preview thumbnail comes back from that one call only, so the result is kept on disk.
 */
async function heroFor(app: string, visualUrl: string | undefined): Promise<HeroImage | null> {
  const key = visualUrl?.match(/^\/api\/visual\/([a-f0-9]{16})$/)?.[1];
  if (!key) return null;
  const cacheKey = `media-${app}-${key}`;
  const hit = readCache<HeroImage>("adapty", cacheKey);
  if (hit) return hit;
  const bytes = readBinary("images", key, "jpg");
  if (!bytes) return null;
  const up = unwrap(
    await withTempFile(bytes, "jpg", (f) => adapty<{ id: string | number; url: string; preview_base64?: string }>(["flows", "media", "upload", f, "--app", app])),
  );
  const hero: HeroImage = { id: String(up.id), url: up.url, previewValue: up.preview_base64 || undefined };
  writeCache("adapty", cacheKey, hero);
  return hero;
}

/** Adapty's own render of a config, so the demo shows the paywall as the device will (read-only). */
async function renderUrl(config: unknown) {
  try {
    const r = await withTempJson(config, (f) => adapty<{ render_url?: string; url?: string }>(["flows", "config", "preview", f]));
    return r.render_url ?? r.url ?? null;
  } catch {
    return null;
  }
}

/** The ad's own words become the paywall's headline and subtitle, in every language. */
function forConcept(l: Localized, conceptId: string, index: number): Localized {
  const c = l.concepts.find((x) => x.id === conceptId) ?? l.concepts[index];
  return c ? { ...l, paywall: { ...l.paywall, headline: c.headline, subtitle: c.subline } } : l;
}

/**
 * POST { conceptId, locales: {lang, localized}[], visualUrl?, create? }
 * Always: build this ad's paywall config and validate it against the base flow (advisory, saves nothing).
 * With create: true, write it to Adapty as a draft flow named after the ad: reused if it exists, never published.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { conceptId: string; locales: { lang: string; localized: Localized }[]; visualUrl?: string; create?: boolean };
  const cur = getCurrent();
  if (!cur) return NextResponse.json({ error: "No campaign yet" }, { status: 400 });
  const ci = cur.campaign.concepts.findIndex((c) => c.id === body.conceptId);
  if (ci < 0) return NextResponse.json({ error: `Unknown ad ${body.conceptId}` }, { status: 400 });
  const concept = cur.campaign.concepts[ci];

  const en = body.locales.find((l) => l.lang === "en");
  if (!en) return NextResponse.json({ error: "English copy is required" }, { status: 400 });
  const others: LocaleInput[] = body.locales
    .filter((l) => l.lang !== "en")
    .map((l) => ({ ...l, meta: langByKey(l.lang) }))
    .filter((l) => l.meta && !l.meta.rtl)
    .map((l) => ({ flowLocale: l.meta!.flowLocale, name: l.meta!.name, localized: forConcept(l.localized, concept.id, ci) }));

  const app = await appId().catch(() => null);
  const base = await baseConfig(app);
  if (!body.create) {
    const draft = buildPaywallDraft(base.config, forConcept(en.localized, concept.id, ci), others);
    return NextResponse.json({ dryRun: true, source: base.source, locales: draft.locales, replaced: draft.replaced });
  }
  if (!app || !base.baseFlowId) {
    return NextResponse.json({ error: `Adapty CLI unavailable: ${"error" in base ? base.error : "app not found"}` }, { status: 503 });
  }

  try {
    const hero = await heroFor(app, body.visualUrl);
    const draft = buildPaywallDraft(base.config, forConcept(en.localized, concept.id, ci), others, hero ?? undefined);

    let validation = "publishable";
    try {
      await withTempJson(draft.config, (f) => adapty(["flows", "config", "validate", base.baseFlowId!, "--app", app, "--config-file", f]));
    } catch (e) {
      validation = `not publishable: ${(e as Error).message}`;
    }

    const name = paywallFlowName(cur.campaign.name, concept.name);
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

    const prev = cur.adPaywalls?.[app]?.[concept.id];
    const result: AdPaywall = {
      ...prev,
      conceptId: concept.id,
      adName: adName(cur.campaign.name, concept.id),
      flowId,
      flowName: name,
      locales: draft.locales,
      validation,
      heroUrl: hero?.url ?? null,
      renderUrl: await renderUrl(draft.config),
      builderUrl: written?.builder_url ?? prev?.builderUrl ?? null,
      updatedAt: new Date().toISOString(),
    };
    saveAdPaywall(app, result);
    return NextResponse.json({ dryRun: false, reused: !!existing, heroAdded: draft.heroAdded, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
