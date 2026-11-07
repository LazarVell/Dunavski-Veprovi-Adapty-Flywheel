"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { PageHead, Panel, Button, Tag, Spinner } from "@/components/ui";
import { Banner, Scaled, FORMATS, type FormatKey } from "@/components/Banner";
import { PaywallPreview } from "@/components/PaywallPreview";
import { ALL_LANGS, langByKey, needsReview, marketFor, type Lang } from "@/lib/languages";
import type { Campaign, Localized, BackCheck } from "@/lib/schemas";
import { CHANNEL_LABEL, COUNTRY_NAME } from "@/lib/insights";

type Stored = { id: string; prompt: string; campaign: Campaign; model?: string; unverified?: string[]; paywallFlow?: { flowId: string; name: string; locales: string[]; validation: string } };
type LocState = { status: "idle" | "loading" | "ready" | "error"; data?: Localized; model?: string; error?: string; check?: BackCheck; checking?: boolean };

const DEFAULT_PROMPT = "Make a campaign for my paying users.";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `${url} failed`);
  return j as T;
}

export default function StudioPage() {
  const [cur, setCur] = useState<Stored | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState("en");
  const [locs, setLocs] = useState<Record<string, LocState>>({});
  const [format, setFormat] = useState<FormatKey>("story");
  const [visuals, setVisuals] = useState<Record<string, string | null>>({});
  const [visualBusy, setVisualBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [fit, setFit] = useState<Record<string, { shrunk: boolean; overflow: boolean }>>({});
  const [pwBusy, setPwBusy] = useState(false);
  const [pwResult, setPwResult] = useState<string | null>(null);
  const [pack, setPack] = useState<{ busy: boolean; progress?: string; confirm?: boolean }>({ busy: false });

  const campaign = cur?.campaign;
  const L = langByKey(lang)!;

  // load the current campaign
  useEffect(() => {
    fetch("/api/campaign").then((r) => r.json()).then((j) => {
      if (j.current) {
        setCur(j.current);
        setPrompt(j.current.prompt);
      }
    });
  }, []);

  const loadLang = useCallback(
    async (key: string) => {
      setLocs((s) => (s[key]?.status === "ready" || s[key]?.status === "loading" ? s : { ...s, [key]: { status: "loading" } }));
      try {
        const r = await post<{ localized: Localized; model: string }>("/api/localize", { lang: key });
        setLocs((s) => ({ ...s, [key]: { ...s[key], status: "ready", data: r.localized, model: r.model } }));
        if (key !== "en") {
          setLocs((s) => ({ ...s, [key]: { ...s[key], checking: true } }));
          const c = await post<{ backCheck: BackCheck }>("/api/localize", { lang: key, check: true }).catch(() => null);
          setLocs((s) => ({ ...s, [key]: { ...s[key], checking: false, check: c?.backCheck ?? undefined } }));
        }
      } catch (e) {
        setLocs((s) => ({ ...s, [key]: { status: "error", error: (e as Error).message } }));
      }
    },
    [],
  );

  // when a campaign exists: load English, find cached visuals
  useEffect(() => {
    if (!campaign) return;
    setLocs({});
    loadLang("en");
    for (const c of campaign.concepts) {
      for (const aspect of ["portrait", "square"] as const) {
        post<{ url: string | null }>("/api/visual", { prompt: c.visualPrompt, aspect, cacheOnly: true })
          .then((r) => setVisuals((v) => ({ ...v, [`${c.id}:${aspect}`]: r.url })))
          .catch(() => {});
      }
    }
  }, [campaign, loadLang]);

  useEffect(() => {
    if (campaign && !locs[lang]) loadLang(lang);
  }, [lang, campaign, locs, loadLang]);

  async function generateCampaign(fresh = false) {
    setBusy(true);
    setErr(null);
    try {
      const r = await post<{ current: Stored }>("/api/campaign", { prompt, fresh });
      setCur(r.current);
      setLang("en");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function generateVisuals() {
    if (!campaign) return;
    setVisualBusy(true);
    setErr(null);
    const jobs = campaign.concepts.flatMap((c) =>
      (["portrait", "square"] as const).map(async (aspect) => {
        const k = `${c.id}:${aspect}`;
        if (visuals[k]) return;
        try {
          const r = await post<{ url: string }>("/api/visual", { prompt: c.visualPrompt, aspect, live });
          setVisuals((v) => ({ ...v, [k]: r.url }));
        } catch (e) {
          setErr((e as Error).message);
        }
      }),
    );
    await Promise.all(jobs);
    setVisualBusy(false);
  }

  function writeAll() {
    ALL_LANGS.forEach((l, i) => setTimeout(() => !locs[l.key] && loadLang(l.key), i * 150));
  }

  async function createPaywall() {
    const ready = Object.entries(locs).filter(([, v]) => v.status === "ready" && v.data);
    setPwBusy(true);
    setPwResult(null);
    try {
      const r = await post<{ flowId: string; locales: string[]; validation: string }>("/api/paywall", {
        create: true,
        locales: ready.map(([k, v]) => ({ lang: k, localized: v.data })),
      });
      setPwResult(`Draft flow created in Adapty with ${r.locales.length} languages (${r.locales.join(", ")}). Validation: ${r.validation}. Flow id ${r.flowId}.`);
    } catch (e) {
      setPwResult(`Could not create the draft: ${(e as Error).message}`);
    } finally {
      setPwBusy(false);
    }
  }

  async function exportPack(confirmed = false) {
    if (!campaign) return;
    const ready = Object.fromEntries(Object.entries(locs).filter(([, v]) => v.status === "ready" && v.data).map(([k, v]) => [k, v.data!]));
    const unreviewed = Object.keys(ready).filter((k) => needsReview(langByKey(k)!));
    if (unreviewed.length && !confirmed) return setPack({ busy: false, confirm: true });
    setPack({ busy: true, progress: "Rendering banners…" });
    const { buildPack } = await import("@/lib/export-pack");
    const blob = await buildPack({
      campaign,
      locs: ready,
      checks: Object.fromEntries(Object.entries(locs).map(([k, v]) => [k, v.check])),
      visuals,
      onProgress: (d, t) => setPack({ busy: true, progress: `Rendering banners ${d}/${t}` }),
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `flywheel-${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip`;
    a.click();
    setPack({ busy: false });
  }

  const loc = locs[lang]?.data;
  const flagged = (locs[lang]?.check?.lines ?? []).filter((x) => x.meaningChanged);
  const review = needsReview(L);
  const market = marketFor(L);
  const readyCount = Object.values(locs).filter((v) => v.status === "ready").length;
  const onFitFor = useMemo(() => {
    const m: Record<string, (f: { shrunk: boolean; overflow: boolean }) => void> = {};
    for (const c of campaign?.concepts ?? []) {
      const k = `${lang}:${format}:${c.id}`;
      m[c.id] = (f) => setFit((s) => (s[k]?.shrunk === f.shrunk && s[k]?.overflow === f.overflow ? s : { ...s, [k]: f }));
    }
    return m;
  }, [campaign, lang, format]);

  return (
    <div>
      <PageHead
        stage={2}
        title="Ads for the users who pay"
        lede="Describe the campaign. Flywheel writes it from what Insights found: who to target, the hook, the markets. You get banners in every language, ad copy, a video script, and a paywall that makes the same promise."
      />

      <Panel>
        <form
          className="flex flex-col gap-3 md:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            generateCampaign();
          }}
        >
          <label className="sr-only" htmlFor="prompt">Campaign request</label>
          <input
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-4 py-3 text-base outline-none focus:border-ink"
            placeholder="Make a campaign for my paying users."
          />
          <Button type="submit" disabled={busy} className="py-3">
            {busy ? <Spinner /> : null}
            {busy ? "Writing the campaign…" : cur ? "Write a new campaign" : "Write the campaign"}
          </Button>
        </form>
        {err ? <p className="mt-3 text-sm text-loss">{err}</p> : null}
      </Panel>

      {!campaign ? (
        <p className="mt-8 max-w-xl text-ink-2">
          No campaign yet. Ask for one above; GPT reads the numbers from Insights and builds the pack around the users who pay.
        </p>
      ) : (
        <>
          {/* Brief */}
          <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <Panel>
              <h2 className="text-2xl font-extrabold">{campaign.name}</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-ink-3">Audience</dt>
                  <dd className="mt-0.5">{campaign.brief.audience}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Hook</dt>
                  <dd className="mt-0.5">{campaign.brief.hook}</dd>
                </div>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <dt className="text-ink-3">Markets</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">{campaign.brief.markets.map((m) => <Tag key={m} tone="money">{COUNTRY_NAME[m] ?? m}</Tag>)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Channels</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">{campaign.brief.channels.map((m) => <Tag key={m}>{CHANNEL_LABEL[m] ?? m}</Tag>)}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-ink-3">Keep out</dt>
                  <dd className="mt-1 space-y-1">{campaign.brief.avoid.map((a) => <div key={a} className="text-loss">{a}</div>)}</dd>
                </div>
              </dl>
            </Panel>
            <Panel>
              <h3 className="text-base font-bold">Why, from your data</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2">
                {campaign.brief.why.map((w) => <li key={w} className="border-l-2 border-money pl-3">{w}</li>)}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                {cur?.unverified?.length ? (
                  <Tag tone="loss">Not in your data: {cur.unverified.join(", ")}. Check before using.</Tag>
                ) : (
                  <Tag tone="money">Every number checked against your data</Tag>
                )}
                {cur?.model ? <span className="text-ink-3">Written by {cur.model}</span> : null}
              </div>
            </Panel>
          </section>

          {/* Language switcher */}
          <section className="sticky top-0 z-10 -mx-5 mt-6 border-b border-line bg-canvas/95 px-5 py-3 backdrop-blur md:-mx-10 md:px-10">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Language">
              {ALL_LANGS.map((l) => {
                const st = locs[l.key]?.status;
                return (
                  <button
                    key={l.key}
                    role="tab"
                    aria-selected={lang === l.key}
                    onClick={() => setLang(l.key)}
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      lang === l.key ? "bg-ink text-white" : "bg-surface hover:bg-white",
                      l.tier !== 1 && lang !== l.key && "text-ink-2",
                    )}
                    title={`${l.name}${l.tier === 1 ? "" : " · needs native review"}`}
                  >
                    <span lang={l.htmlLang}>{l.native}</span>
                    {l.tier === "data" ? <span className="ml-1 text-xs opacity-70">from your data</span> : null}
                    {st === "loading" ? <span className="ml-1 opacity-60">…</span> : null}
                  </button>
                );
              })}
              <Button kind="quiet" className="ml-auto" onClick={writeAll}>
                Write all languages ({readyCount}/{ALL_LANGS.length})
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {review ? (
                <Tag tone="warn">Machine-written. Have a native speaker check this before publishing.</Tag>
              ) : (
                <Tag tone="money">Checked</Tag>
              )}
              {market ? (
                <span className="text-ink-3">
                  {L.name} speakers in your data: {market.users.toLocaleString()} users, ${market.revPerUser.toFixed(2)} each
                  {L.tier === "data" ? `, ${market.revenueShare}% of revenue` : ""}
                </span>
              ) : (
                <span className="text-ink-3">No {L.name} speakers in your data yet. This is a new market.</span>
              )}
              {L.key.startsWith("sr") ? (
                <button className="text-ink-2 underline" onClick={() => setLang(L.key === "sr-Latn" ? "sr-Cyrl" : "sr-Latn")}>
                  {L.key === "sr-Latn" ? "Show Cyrillic" : "Show Latin"}
                </button>
              ) : null}
              {locs[lang]?.model ? <span className="text-ink-3">Written by {locs[lang]?.model}</span> : null}
              {locs[lang]?.checking ? <span className="text-ink-3">Checking meaning against English…</span> : null}
              {locs[lang]?.check && !flagged.length ? <Tag tone="money">Back-translation: meaning matches English</Tag> : null}
              {flagged.length ? <Tag tone="loss">{flagged.length} line{flagged.length > 1 ? "s" : ""} changed meaning</Tag> : null}
            </div>
          </section>

          {locs[lang]?.status === "error" ? <p className="mt-4 text-sm text-loss">{locs[lang]?.error}</p> : null}

          {/* Banners */}
          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Banners</h2>
              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(FORMATS) as FormatKey[]).map((k) => (
                  <button key={k} onClick={() => setFormat(k)} className={clsx("rounded-md px-2.5 py-1 text-sm", format === k ? "bg-ink text-white" : "bg-surface")}>
                    {FORMATS[k].ratio} <span className="opacity-70">{FORMATS[k].label}</span>
                  </button>
                ))}
                <label className="ml-2 flex items-center gap-1.5 text-sm text-ink-2">
                  <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Fast model
                </label>
                <Button kind="quiet" onClick={generateVisuals} disabled={visualBusy}>
                  {visualBusy ? <Spinner /> : null} {visualBusy ? "Generating visuals…" : "Generate visuals"}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {campaign.concepts.map((c, i) => {
                const lc = loc?.concepts.find((x) => x.id === c.id) ?? loc?.concepts[i];
                const f = fit[`${lang}:${format}:${c.id}`];
                return (
                  <figure key={c.id}>
                    {lc ? (
                      <Scaled width={format === "story" ? 260 : 320} format={format}>
                        <Banner
                          format={format}
                          headline={lc.headline}
                          subline={lc.subline}
                          cta={lc.cta}
                          htmlLang={L.htmlLang}
                          visualUrl={visuals[`${c.id}:${FORMATS[format].visual}`]}
                          conceptIndex={i}
                          onFit={onFitFor[c.id]}
                        />
                      </Scaled>
                    ) : (
                      <div className="grid aspect-[9/16] w-[260px] place-items-center rounded-lg bg-surface text-sm text-ink-3">
                        <Spinner />
                      </div>
                    )}
                    <figcaption className="mt-2 text-sm">
                      <div className="font-semibold">{c.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!visuals[`${c.id}:${FORMATS[format].visual}`] ? <Tag>Placeholder visual</Tag> : null}
                        {f?.overflow ? <Tag tone="loss">Text overflows: shorten it</Tag> : f?.shrunk ? <Tag tone="neutral">Text shrunk to fit</Tag> : null}
                      </div>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>

          {flagged.length ? (
            <Panel className="mt-6 border-loss/30">
              <h3 className="font-bold">Lines whose meaning changed in {L.name}</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {flagged.map((x) => (
                  <li key={x.field}>
                    <span className="font-semibold">{x.field}:</span> reads back as “{x.backTranslation}”. <span className="text-ink-2">{x.note}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {/* Copy, script, paywall */}
          {loc ? (
            <section className="mt-8 grid gap-5 xl:grid-cols-[1fr_1fr_340px]">
              <Panel>
                <h2 className="text-xl font-bold">Ad copy</h2>
                <div className="mt-3 space-y-4" lang={L.htmlLang}>
                  {loc.adCopy.map((a, i) => (
                    <div key={i} className="border-b border-line pb-4 last:border-0">
                      <div className="text-xs text-ink-3">Variant {String.fromCharCode(65 + i)}</div>
                      <div className="mt-1 font-semibold">{a.headline}</div>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.primaryText}</p>
                      <p className="mt-1 text-xs text-ink-3">{a.description}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel>
                <h2 className="text-xl font-bold">TikTok / Reels script</h2>
                <p className="mt-2 text-sm font-semibold" lang={L.htmlLang}>{loc.videoScript.hook}</p>
                <ol className="mt-3 space-y-3 text-sm" lang={L.htmlLang}>
                  {loc.videoScript.shots.map((s, i) => (
                    <li key={i} className="grid grid-cols-[52px_1fr] gap-2">
                      <span className="text-ink-3 tabular-nums">{s.time}</span>
                      <span>
                        {s.shot}
                        <span className="mt-0.5 block font-semibold text-lumen">“{s.onScreenText}”</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-sm">CTA: <span className="font-semibold" lang={L.htmlLang}>{loc.videoScript.cta}</span></p>
              </Panel>
              <Panel>
                <h2 className="text-xl font-bold">Matching paywall</h2>
                <p className="mt-1 text-sm text-ink-2">Same promise as the ad, in the same language.</p>
                <div className="mt-4">
                  <PaywallPreview pw={loc.paywall} htmlLang={L.htmlLang} />
                </div>
                <Button kind="money" className="mt-4 w-full" onClick={createPaywall} disabled={pwBusy || !readyCount}>
                  {pwBusy ? <Spinner /> : null}
                  {pwBusy ? "Creating draft in Adapty…" : `Create draft in Adapty (${readyCount} language${readyCount === 1 ? "" : "s"})`}
                </Button>
                <p className="mt-2 text-xs text-ink-3">Creates a new flow as a draft. Nothing is published or shown to users.</p>
                {pwResult || cur?.paywallFlow ? (
                  <p className="mt-2 text-sm">{pwResult ?? `Draft “${cur!.paywallFlow!.name}” exists with ${cur!.paywallFlow!.locales.length} languages.`}</p>
                ) : null}
              </Panel>
            </section>
          ) : null}

          {/* Export */}
          <Panel className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="text-xl font-bold">Export pack</h2>
              <p className="mt-1 text-sm text-ink-2">
                Banners in three sizes for every written language, an ad copy CSV with a review status per line, video scripts, and
                targeting JSON. Ready to upload in Meta Ads Manager or TikTok Ads Manager.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button kind="quiet" disabled title="Their ad APIs need app review; not wired up in a weekend">Publish to Meta / TikTok</Button>
              <Button onClick={() => exportPack()} disabled={pack.busy || !readyCount}>
                {pack.busy ? <Spinner /> : null} {pack.busy ? pack.progress : `Download pack (${readyCount} languages)`}
              </Button>
            </div>
            {pack.confirm ? (
              <div className="w-full rounded-lg bg-warn-soft p-4 text-sm">
                <p>
                  This pack includes machine-written languages that no native speaker has checked:{" "}
                  {Object.keys(locs).filter((k) => locs[k].status === "ready" && needsReview(langByKey(k) as Lang)).map((k) => langByKey(k)!.name).join(", ")}.
                  Their rows are marked <code>needs_native_review</code> and listed in NEEDS_REVIEW.txt.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => { setPack({ busy: false }); exportPack(true); }}>Download with review list</Button>
                  <Button kind="quiet" onClick={() => setPack({ busy: false })}>Cancel</Button>
                </div>
              </div>
            ) : null}
          </Panel>
        </>
      )}
    </div>
  );
}
