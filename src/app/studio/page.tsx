"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { PageHead, Panel, Button, Tag, Spinner } from "@/components/ui";
import { Banner, Scaled, FORMATS, type FormatKey } from "@/components/Banner";
import { AdToPaywall } from "@/components/AdToPaywall";
import type { AdPaywall } from "@/lib/ads";
import { ALL_LANGS, langByKey, needsReview, marketFor, type Lang } from "@/lib/languages";
import type { Campaign, Localized, BackCheck } from "@/lib/schemas";
import { CHANNEL_LABEL, COUNTRY_NAME } from "@/lib/insights";

type Stored = {
  id: string; prompt: string; campaign: Campaign; model?: string; unverified?: string[];
  /** banner id -> how many earlier versions can be restored */
  undoable?: Record<string, number>;
  bannerUpdatedAt?: Record<string, string>;
  bannerInstructions?: string;
};
type Payload = { current: Stored | null; visuals: Record<string, string | null> };
type BannerResult = Payload & { summary: string; changed: { words: boolean; picture: boolean } };
type LocState = { status: "idle" | "loading" | "ready" | "error"; data?: Localized; model?: string; error?: string; check?: BackCheck; checking?: boolean };
type EditState = { text: string; busy?: boolean; note?: string; error?: string };

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
  const [adPaywalls, setAdPaywalls] = useState<Record<string, AdPaywall>>({});
  const [pack, setPack] = useState<{ busy: boolean; progress?: string; confirm?: boolean }>({ busy: false });
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [applying, setApplying] = useState(false);
  const [rewriteNote, setRewriteNote] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const locsRef = useRef(locs);
  locsRef.current = locs;

  const campaign = cur?.campaign;
  const campaignId = cur?.id;
  const L = langByKey(lang)!;

  // load the current campaign; ?refresh=<concept id> (from Watch's fatigue alert) pre-fills a refresh request
  useEffect(() => {
    fetch("/api/campaign").then((r) => r.json()).then((j) => {
      if (j.current) {
        setCur(j.current);
        setInstructions(j.current.bannerInstructions ?? "");
        const tired = (j.current as Stored).campaign.concepts.find((c) => c.id === new URLSearchParams(window.location.search).get("refresh"));
        if (tired) {
          setRefreshing(tired.name);
          setPrompt(`“${tired.name}” is wearing out (click-through 2.8% → 2.1%). Keep its promise (“${tired.headline}”) and the same audience and markets; make 3 fresh concepts with new openings and visuals.`);
        } else setPrompt(j.current.prompt);
      }
      setVisuals(j.visuals ?? {});
      setAdPaywalls(j.adapty?.adPaywalls ?? {});
    });
  }, []);

  /** Writes a language. `force` re-writes one already on screen (after a banner edit) and keeps showing the old words meanwhile. */
  const loadLang = useCallback(
    async (key: string, force = false) => {
      setLocs((s) =>
        force
          ? { ...s, [key]: { ...s[key], status: "loading", check: undefined } }
          : s[key]?.status === "ready" || s[key]?.status === "loading" ? s : { ...s, [key]: { status: "loading" } },
      );
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

  // a new campaign: start over with English (banner edits keep the same campaign id, so they don't land here)
  useEffect(() => {
    if (!campaignId) return;
    setLocs({});
    setEdits({});
    loadLang("en");
  }, [campaignId, loadLang]);

  useEffect(() => {
    if (campaign && !locs[lang]) loadLang(lang);
  }, [lang, campaign, locs, loadLang]);

  async function generateCampaign(fresh = false) {
    setBusy(true);
    setErr(null);
    try {
      const r = await post<Payload>("/api/campaign", { prompt, fresh });
      if (r.current!.id !== cur?.id) {
        setAdPaywalls({}); // a new campaign means new ads
        setInstructions(r.current!.bannerInstructions ?? "");
        setRewriteNote(null);
      }
      setCur(r.current);
      setVisuals(r.visuals);
      setLang("en");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** After a banner changed on the server: show it, and re-write every language already written if its words changed. */
  function applyBannerResult(r: BannerResult) {
    setCur(r.current);
    setVisuals(r.visuals);
    if (r.changed.words) {
      const written = Object.entries(locsRef.current).filter(([, v]) => v.status === "ready" || v.data).map(([k]) => k);
      written.forEach((k, i) => setTimeout(() => loadLang(k, true), i * 150));
    }
  }

  async function applyInstructions() {
    if (!instructions.trim()) return;
    setApplying(true);
    setErr(null);
    setRewriteNote(null);
    try {
      const r = await post<BannerResult>("/api/banner", { action: "rewrite", instructions });
      applyBannerResult(r);
      setRewriteNote(r.summary);
      // new descriptions -> new photos
      if (r.changed.picture && r.current) await generateVisuals(r.current.campaign, r.visuals);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  async function editBanner(conceptId: string, action: "edit" | "undo") {
    const text = edits[conceptId]?.text?.trim() ?? "";
    if (action === "edit" && !text) return;
    setEdits((s) => ({ ...s, [conceptId]: { ...s[conceptId], text, busy: true, error: undefined, note: undefined } }));
    try {
      const r = await post<BannerResult>("/api/banner", action === "edit" ? { action, conceptId, instruction: text, live } : { action, conceptId });
      applyBannerResult(r);
      const nothing = !r.changed.words && !r.changed.picture;
      setEdits((s) => ({ ...s, [conceptId]: { text: action === "edit" && nothing ? text : "", note: nothing ? `Nothing changed. ${r.summary}` : r.summary } }));
    } catch (e) {
      setEdits((s) => ({ ...s, [conceptId]: { ...s[conceptId], busy: false, error: (e as Error).message } }));
    }
  }

  /** Generates every banner photo that doesn't exist yet. Takes the campaign explicitly so it can run right after a rewrite. */
  async function generateVisuals(camp: Campaign | undefined = campaign, have: Record<string, string | null> = visuals) {
    if (!camp) return;
    setVisualBusy(true);
    setErr(null);
    const jobs = camp.concepts.flatMap((c) =>
      (["portrait", "square"] as const).map(async (aspect) => {
        const k = `${c.id}:${aspect}`;
        if (have[k]) return;
        try {
          const r = await post<{ url: string }>("/api/visual", { prompt: c.visualPrompt, aspect, live });
          setVisuals((v) => ({ ...v, [k]: r.url }));
        } catch (e) {
          setErr((e as Error).message);
        }
      }),
    );
    await Promise.all(jobs);
    // pick up the paywall crops the server makes from the new square photos
    await fetch("/api/campaign").then((r) => r.json()).then((j) => j.visuals && setVisuals(j.visuals)).catch(() => {});
    setVisualBusy(false);
  }

  function writeAll() {
    ALL_LANGS.forEach((l, i) => setTimeout(() => !locs[l.key] && loadLang(l.key), i * 150));
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
        {refreshing ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <Tag tone="warn">Refreshing a tired ad</Tag>
            Watch flagged “{refreshing}”. The request below keeps what worked; write it to get fresh variants.
          </div>
        ) : null}
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
                <Button kind="quiet" onClick={() => generateVisuals()} disabled={visualBusy || applying}>
                  {visualBusy ? <Spinner /> : null} {visualBusy ? "Generating visuals…" : "Generate visuals"}
                </Button>
              </div>
            </div>

            {/* Instructions for every banner: words and pictures */}
            <form
              className="mt-4 flex flex-col gap-2 md:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                applyInstructions();
              }}
            >
              <label className="sr-only" htmlFor="banner-instructions">Instructions for all banners</label>
              <input
                id="banner-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-ink"
                placeholder="Instructions for all banners, e.g. “warm evening light, people in their 30s, shorter headlines”"
              />
              <Button type="submit" disabled={applying || visualBusy || !instructions.trim()}>
                {applying ? <Spinner /> : null}
                {applying ? (visualBusy ? "Making new pictures…" : "Rewriting the banners…") : "Apply to all banners"}
              </Button>
            </form>
            {rewriteNote ? <p className="mt-2 text-sm text-ink-2">{rewriteNote}</p> : null}

            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {campaign.concepts.map((c, i) => {
                const lc = loc?.concepts.find((x) => x.id === c.id) ?? loc?.concepts[i];
                const f = fit[`${lang}:${format}:${c.id}`];
                const ed = edits[c.id];
                return (
                  <figure key={c.id}>
                    {lc ? (
                      <div className="relative w-fit">
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
                        {ed?.busy ? (
                          <div className="absolute inset-0 grid place-items-center rounded-lg bg-canvas/70 text-sm font-semibold backdrop-blur-[2px]">
                            <span className="flex items-center gap-2"><Spinner /> Editing…</span>
                          </div>
                        ) : null}
                      </div>
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
                      <form
                        className="mt-2 flex gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          editBanner(c.id, "edit");
                        }}
                      >
                        <label className="sr-only" htmlFor={`edit-${c.id}`}>Change {c.name}</label>
                        <input
                          id={`edit-${c.id}`}
                          value={ed?.text ?? ""}
                          onChange={(e) => setEdits((s) => ({ ...s, [c.id]: { ...s[c.id], text: e.target.value } }))}
                          disabled={ed?.busy || applying}
                          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-ink disabled:opacity-60"
                          placeholder="Change this banner, e.g. “put it in a café”"
                        />
                        <Button type="submit" kind="quiet" className="px-3 py-1.5" disabled={ed?.busy || applying || !ed?.text?.trim()}>
                          Edit
                        </Button>
                      </form>
                      {ed?.busy ? <p className="mt-1 text-xs text-ink-3">A new picture can take up to a minute.</p> : null}
                      {ed?.note ? <p className="mt-1 text-xs text-ink-2">{ed.note}</p> : null}
                      {ed?.error ? <p className="mt-1 text-xs text-loss">{ed.error}</p> : null}
                      {(cur?.undoable?.[c.id] ?? 0) > 0 && !ed?.busy ? (
                        <button className="mt-1 text-xs text-ink-2 underline disabled:opacity-50" disabled={applying} onClick={() => editBanner(c.id, "undo")}>
                          Undo last change
                        </button>
                      ) : null}
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

          {/* Ad -> its own paywall, wired in Adapty */}
          {loc ? (
            <AdToPaywall
              campaign={campaign}
              lang={L}
              loc={loc}
              ready={Object.entries(locs).filter(([, v]) => v.status === "ready" && v.data).map(([k, v]) => ({ lang: k, localized: v.data! }))}
              visuals={visuals}
              saved={adPaywalls}
              bannerUpdatedAt={cur?.bannerUpdatedAt ?? {}}
              onSaved={(p) => setAdPaywalls((s) => ({ ...s, [p.conceptId]: p }))}
            />
          ) : null}

          {/* Copy, script */}
          {loc ? (
            <section className="mt-8 grid gap-5 xl:grid-cols-2">
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
