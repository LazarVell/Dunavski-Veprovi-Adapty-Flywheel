"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { PageHead, Panel, Button, Tag, Spinner } from "@/components/ui";
import { Banner, Scaled, FORMATS, type FormatKey } from "@/components/Banner";
import { AdToPaywall } from "@/components/AdToPaywall";
import { batchSteps } from "@/lib/batch-steps";
import type { AdPaywall } from "@/lib/ads";
import { ALL_LANGS, langByKey, langsForMarkets, needsReview, marketFor } from "@/lib/languages";
import type { Campaign, Localized, BackCheck } from "@/lib/schemas";
import { CHANNEL_LABEL, COUNTRY_NAME } from "@/lib/insights";

type Stored = {
  id: string; prompt: string; campaign: Campaign; model?: string; unverified?: string[];
  /** banner id -> how many earlier versions can be restored */
  undoable?: Record<string, number>;
  /** languages already written and saved for this campaign */
  writtenLangs?: string[];
  bannerUpdatedAt?: Record<string, string>;
  bannerInstructions?: string;
};
type Summary = { id: string; name: string; prompt: string; createdAt: string };
type Payload = { current: Stored | null; visuals: Record<string, string | null>; previous?: Summary[] };
/** What's on screen when a run starts, to put back if the new campaign can't be written. */
type Held = { cur: Stored | null; visuals: Record<string, string | null>; adPaywalls: Record<string, AdPaywall> };
type BannerResult = Payload & { summary: string; changed: { words: boolean; picture: boolean } };
type LocState = { status: "idle" | "loading" | "ready" | "error"; data?: Localized; model?: string; error?: string; check?: BackCheck; checking?: boolean };
type EditState = { text: string; busy?: boolean; note?: string; error?: string };
/** One step of the Creative Studio skill's flow, as GET /api/campaign returns it. */
type FlowStep = { id: string; title: string; detail: string; group?: string; auto: boolean };
type Director = { source: string; steps: FlowStep[]; problems: string[] };
type StepRun = { status: "pending" | "running" | "done" | "skipped" | "error" | "manual"; note?: string };

const DEFAULT_PROMPT = "Make a campaign for my paying users.";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `${url} failed`);
  return j as T;
}

/** The saved campaigns, top right. Opening one needs no model call. */
function PreviousCampaigns({ items, opening, disabled, onOpen }: { items: Summary[]; opening: string | null; disabled: boolean; onOpen: (id: string) => void }) {
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <aside className="w-full rounded-xl border border-line bg-surface p-3 lg:w-80" aria-label="Previous campaigns">
      <h2 className="px-2 text-sm font-semibold">Previous campaigns</h2>
      {items.length === 0 ? (
        <p className="mt-1 px-2 text-xs text-ink-3">None yet. A campaign is saved here when a new one replaces it.</p>
      ) : (
        <ul className="mt-1 max-h-40 overflow-y-auto">
          {items.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onOpen(c.id)}
                disabled={disabled}
                title={c.prompt}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-ink-3">{when(c.createdAt)}</span>
                </span>
                {opening === c.id ? <Spinner /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
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
  const [pack, setPack] = useState<{ busy: boolean; progress?: string; confirm?: boolean; error?: string }>({ busy: false });
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [fromIdea, setFromIdea] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [applying, setApplying] = useState(false);
  const [rewriteNote, setRewriteNote] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [director, setDirector] = useState<Director | null>(null);
  const [run, setRun] = useState<Record<string, StepRun>>({});
  const [pendingRun, setPendingRun] = useState<{ prompt: string; back: Held } | null>(null);
  /** an Insights link opened the page and a run is about to start */
  const [starting, setStarting] = useState(false);
  const [previous, setPrevious] = useState<Summary[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  /** the page's link, read once: the address is cleaned straight after so a reload can't start another run */
  const urlRef = useRef<{ suggested?: string; refresh: string | null; run: boolean } | null>(null);
  const autoRunQueued = useRef(false);
  const locsRef = useRef(locs);
  locsRef.current = locs;
  /** languages being fetched, so one isn't asked for twice; and which campaign they belong to */
  const inflightRef = useRef<Record<string, Promise<boolean> | undefined>>({});
  const genRef = useRef(0);
  /** languages to bring back when the page opens on a campaign that already has them */
  const restoreLangs = useRef<string[]>([]);

  const campaign = cur?.campaign;
  const campaignId = cur?.id;
  const L = langByKey(lang)!;

  // an Insights idea fills the request box before the first paint, without waiting for the server
  useLayoutEffect(() => {
    if (urlRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const suggested = params.get("prompt")?.trim() || undefined;
    const refresh = params.get("refresh");
    const run = !!suggested && !refresh && params.get("run") === "1";
    urlRef.current = { suggested, refresh, run };
    // a reload must not start the same run again
    if (params.has("prompt") || params.has("run")) window.history.replaceState(null, "", window.location.pathname);
    if (suggested && !refresh) {
      setPrompt(suggested);
      setFromIdea(true);
    }
    if (run) setStarting(true);
  }, []);

  // load the current campaign. ?refresh=<concept id> from Watch's fatigue alert pre-fills the request and waits for a click;
  // ?prompt=<text>&run=1 from an Insights idea starts the flow, so the old campaign is never put on screen.
  useEffect(() => {
    fetch("/api/campaign").then((r) => r.json()).then((j) => {
      const { suggested, refresh, run } = urlRef.current ?? { refresh: null, run: false };
      setDirector(j.director ?? null);
      setPrevious(j.previous ?? []);
      if (run) {
        if (!autoRunQueued.current) {
          autoRunQueued.current = true;
          setPendingRun({ prompt: suggested!, back: { cur: j.current ?? null, visuals: j.visuals ?? {}, adPaywalls: j.adapty?.adPaywalls ?? {} } });
        }
        return;
      }
      if (j.current) {
        restoreLangs.current = j.current.writtenLangs ?? [];
        setCur(j.current);
        setInstructions(j.current.bannerInstructions ?? "");
        const tired = (j.current as Stored).campaign.concepts.find((c) => c.id === refresh);
        if (tired) {
          setRefreshing(tired.name);
          setPrompt(`“${tired.name}” is wearing out (click-through 2.8% → 2.1%). Keep its promise (“${tired.headline}”) and the same audience and markets; make 3 fresh concepts with new openings and visuals.`);
        } else if (!suggested) setPrompt(j.current.prompt);
      }
      setVisuals(j.visuals ?? {});
      setAdPaywalls(j.adapty?.adPaywalls ?? {});
    });
  }, []);

  /**
   * Gets a language: written once per campaign on the server, then its saved text. `force` asks again after a
   * banner edit (the server re-writes just the edited banners) and keeps showing the old words meanwhile.
   * A language already being fetched isn't asked for twice.
   */
  const loadLang = useCallback(
    (key: string, force = false): Promise<boolean> => {
      const st = locsRef.current[key]?.status;
      if (!force && st === "ready") return Promise.resolve(true);
      const running = inflightRef.current[key];
      if (!force && running) return running;
      const gen = genRef.current;
      const set = (f: (s: Record<string, LocState>) => Record<string, LocState>) => {
        if (genRef.current !== gen) return; // a new campaign was written meanwhile: drop the old campaign's language
        setLocs((s) => {
          const next = f(s);
          locsRef.current = next;
          return next;
        });
      };
      set((s) => (force ? { ...s, [key]: { ...s[key], status: "loading", check: undefined } } : { ...s, [key]: { ...s[key], status: "loading", error: undefined } }));
      const job = (async () => {
        try {
          const r = await post<{ localized: Localized; model: string }>("/api/localize", { lang: key });
          set((s) => ({ ...s, [key]: { ...s[key], status: "ready", data: r.localized, model: r.model } }));
          if (key !== "en") {
            set((s) => ({ ...s, [key]: { ...s[key], checking: true } }));
            const c = await post<{ backCheck: BackCheck }>("/api/localize", { lang: key, check: true }).catch(() => null);
            set((s) => ({ ...s, [key]: { ...s[key], checking: false, check: c?.backCheck ?? undefined } }));
          }
          return true;
        } catch (e) {
          // keep any words already on screen; the tab can ask again
          set((s) => ({ ...s, [key]: { ...s[key], status: "error", error: (e as Error).message } }));
          return false;
        }
      })();
      inflightRef.current[key] = job;
      job.finally(() => {
        if (inflightRef.current[key] === job) delete inflightRef.current[key];
      });
      return job;
    },
    [],
  );

  // a new campaign: start over with English (banner edits keep the same campaign id, so they don't land here)
  useEffect(() => {
    if (!campaignId) return;
    genRef.current += 1;
    inflightRef.current = {};
    locsRef.current = {};
    setLocs({});
    setEdits({});
    // English, plus every language already saved for this campaign (free: the server returns the saved text)
    [...new Set(["en", ...restoreLangs.current])].filter((k) => langByKey(k)).forEach((k) => loadLang(k));
    restoreLangs.current = [];
  }, [campaignId, loadLang]);

  useEffect(() => {
    if (campaign && !locs[lang]) loadLang(lang);
  }, [lang, campaign, locs, loadLang]);

  // an Insights idea with run=1: start the flow as soon as the skill's steps are loaded
  useEffect(() => {
    if (!pendingRun || !director || busy) return;
    const p = pendingRun;
    setPendingRun(null);
    runDirector(p);
    // runDirector reads the state of this render, which already has the loaded skill
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRun, director, busy]);

  /** Step "campaign": always a new campaign, replacing the current one. */
  async function generateCampaign(text: string): Promise<Payload> {
    const r = await post<Payload>("/api/campaign", { prompt: text });
    setRefreshing(null); // the tired ad has been refreshed; a reload shouldn't offer it again
    if (window.location.search.includes("refresh=")) window.history.replaceState(null, "", window.location.pathname);
    restoreLangs.current = [];
    setCur(r.current);
    setVisuals(r.visuals);
    setPrevious(r.previous ?? []);
    return r;
  }

  /** Brings a saved campaign back, with its languages, pictures and edits. */
  async function openCampaign(id: string) {
    setOpening(id);
    setErr(null);
    try {
      const r = await post<Payload & { adapty?: { adPaywalls?: Record<string, AdPaywall> } }>("/api/campaign", { open: id });
      restoreLangs.current = r.current?.writtenLangs ?? [];
      setRun({});
      setRefreshing(null);
      setFromIdea(false);
      setRewriteNote(null);
      setLang("en");
      setPrompt(r.current?.prompt ?? "");
      setInstructions(r.current?.bannerInstructions ?? "");
      setCur(r.current);
      setVisuals(r.visuals);
      setAdPaywalls(r.adapty?.adPaywalls ?? {});
      setPrevious(r.previous ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setOpening(null);
    }
  }

  /**
   * The director: runs the Creative Studio skill's flow after the user writes the campaign
   * (.claude/skills/creative-studio/SKILL.md, "## Flow"). Steps sharing a group run together;
   * `auto: false` steps (Adapty) are left for the user. A failed step stops the steps after it.
   */
  async function runDirector(opts: { prompt?: string; back?: Held } = {}) {
    const text = (opts.prompt ?? prompt).trim();
    if (!text) return;
    const steps = director?.steps ?? [];
    const back: Held = opts.back ?? { cur, visuals, adPaywalls };
    let written = false;
    setStarting(false);
    setBusy(true);
    setErr(null);
    setRun(Object.fromEntries(steps.map((s) => [s.id, { status: s.auto ? "pending" : "manual" }])));
    // the old campaign leaves the page now, so it's never mistaken for the new one
    setPrompt(text);
    setCur(null);
    setVisuals({});
    setAdPaywalls({});
    setInstructions("");
    setRewriteNote(null);
    setLang("en");
    const mark = (id: string, status: StepRun["status"], note?: string) => setRun((r) => ({ ...r, [id]: { status, note } }));
    const ctx: { cur: Stored | null; visuals: Record<string, string | null> } = { cur: null, visuals: {} };

    const runStep = async (s: FlowStep) => {
      if (!s.auto) return;
      mark(s.id, "running");
      if (s.id === "campaign") {
        const r = await generateCampaign(text);
        written = true;
        Object.assign(ctx, { cur: r.current, visuals: r.visuals });
        return mark(s.id, "done", r.current?.campaign.name);
      }
      if (!ctx.cur) return mark(s.id, "skipped", "no campaign");
      if (s.id === "art-direction") {
        const r = await post<BannerResult>("/api/banner", { action: "art-direction" });
        Object.assign(ctx, { cur: r.current });
        setCur(r.current);
        setInstructions(r.current?.bannerInstructions ?? r.summary);
        return mark(s.id, "done");
      }
      if (s.id === "visuals") {
        const missing = ctx.cur.campaign.concepts.flatMap((c) => ["portrait", "square"].map((a) => `${c.id}:${a}`)).filter((k) => !ctx.visuals[k]);
        if (!missing.length) return mark(s.id, "done", "already made");
        const failed = await generateVisuals(ctx.cur.campaign, ctx.visuals);
        if (failed) throw new Error(`${failed.count} of ${missing.length} pictures failed (${failed.reason}). Press Generate visuals to try again.`);
        return mark(s.id, "done", `${missing.length} pictures`);
      }
      if (s.id === "languages") {
        const keys = langsForMarkets(ctx.cur.campaign.brief.markets);
        const ok = await Promise.all(keys.map((k, i) => new Promise((r) => setTimeout(r, i * 150)).then(() => loadLang(k))));
        const name = (k: string) => langByKey(k)?.name ?? k;
        const failed = keys.filter((_, i) => !ok[i]);
        if (failed.length) throw new Error(`Couldn't write ${failed.map(name).join(", ")}. Open the language's tab to try again.`);
        return mark(s.id, "done", keys.map(name).join(", "));
      }
      mark(s.id, "skipped", "not a step this page knows");
    };

    try {
      for (const batch of batchSteps(steps)) {
        const results = await Promise.allSettled(batch.map((s) => runStep(s).catch((e) => { mark(s.id, "error", "failed"); throw e; })));
        const failed = results.flatMap((x) => (x.status === "rejected" ? [(x.reason as Error).message] : []));
        if (failed.length) throw new Error(failed.join(" "));
      }
    } catch (e) {
      setErr((e as Error).message);
      setRun((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status === "pending" ? { status: "skipped", note: "stopped" } : v])));
      // no new campaign came back: the one that was on screen is still the current one
      if (!written && back.cur) {
        restoreLangs.current = [...new Set([...(back.cur.writtenLangs ?? []), ...Object.keys(locsRef.current)])];
        setCur(back.cur);
        setVisuals(back.visuals);
        setAdPaywalls(back.adPaywalls);
        setInstructions(back.cur.bannerInstructions ?? "");
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Generate visuals": changed instructions rewrite the banners and make new pictures;
   * unchanged ones just make the pictures that are missing.
   */
  async function generateFromInstructions() {
    const changed = instructions.trim() && instructions.trim() !== (cur?.bannerInstructions ?? "").trim();
    if (changed) return applyInstructions();
    const missing = (campaign?.concepts ?? []).some((c) => !visuals[`${c.id}:portrait`] || !visuals[`${c.id}:square`]);
    if (!missing) return setRewriteNote("All pictures are up to date. Change the instructions above to make new ones.");
    setRewriteNote(null);
    await generateVisuals();
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

  /**
   * Generates every banner photo that doesn't exist yet. Takes the campaign explicitly so it can run right after a rewrite.
   * Returns what failed, or null if every picture was made.
   */
  async function generateVisuals(camp: Campaign | undefined = campaign, have: Record<string, string | null> = visuals): Promise<{ count: number; reason: string } | null> {
    if (!camp) return null;
    setVisualBusy(true);
    setErr(null);
    const failures: string[] = [];
    const jobs = camp.concepts.flatMap((c) =>
      (["portrait", "square"] as const).map(async (aspect) => {
        const k = `${c.id}:${aspect}`;
        if (have[k]) return;
        try {
          const r = await post<{ url: string }>("/api/visual", { conceptId: c.id, aspect, live });
          setVisuals((v) => ({ ...v, [k]: r.url }));
        } catch (e) {
          failures.push((e as Error).message);
          setErr((e as Error).message);
        }
      }),
    );
    await Promise.all(jobs);
    // pick up the paywall crops the server makes from the new square photos
    await fetch("/api/campaign").then((r) => r.json()).then((j) => j.visuals && setVisuals(j.visuals)).catch(() => {});
    setVisualBusy(false);
    return failures.length ? { count: failures.length, reason: failures[0] } : null;
  }

  /** Writes every language not written yet, and asks again for any that failed. */
  function writeAll() {
    ALL_LANGS.forEach((l, i) => setTimeout(() => (!locsRef.current[l.key] || locsRef.current[l.key].status === "error") && loadLang(l.key), i * 150));
  }

  /** A language a native speaker should read before this goes out: flagged by tier, or by its meaning check. */
  const wantsReview = (k: string) => needsReview(langByKey(k)!) || (locs[k]?.check?.lines ?? []).some((x) => x.meaningChanged);

  async function exportPack(confirmed = false) {
    if (!campaign) return;
    const ready = Object.fromEntries(Object.entries(locs).filter(([, v]) => v.status === "ready" && v.data).map(([k, v]) => [k, v.data!]));
    if (Object.keys(ready).some(wantsReview) && !confirmed) return setPack({ busy: false, confirm: true });
    setPack({ busy: true, progress: "Rendering banners…" });
    try {
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
    } catch (e) {
      setPack({ busy: false, error: `The pack couldn't be built: ${(e as Error).message || "rendering failed"}. Try again.` });
    }
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
        right={
          <PreviousCampaigns
            items={previous}
            opening={opening}
            onOpen={openCampaign}
            disabled={busy || starting || applying || visualBusy || pack.busy || !!opening || Object.values(edits).some((e) => e.busy)}
          />
        }
      />

      <Panel>
        {refreshing ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <Tag tone="warn">Refreshing a tired ad</Tag>
            Watch flagged “{refreshing}”. The request below keeps what worked; write it to get fresh variants.
          </div>
        ) : fromIdea ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <Tag tone="lumen">From Insights</Tag>
            A campaign idea from your data.
          </div>
        ) : null}
        <form
          className="flex flex-col gap-3 md:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            runDirector();
          }}
        >
          <label className="sr-only" htmlFor="prompt">Campaign request</label>
          <input
            id="prompt"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              // no longer the request that came from Insights or Watch
              setFromIdea(false);
              setRefreshing(null);
            }}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-4 py-3 text-base outline-none focus:border-ink"
            placeholder="Make a campaign for my paying users."
          />
          <Button type="submit" disabled={busy || applying || visualBusy || !director} className="py-3">
            {busy ? <Spinner /> : null}
            {busy ? "Running the flow…" : cur ? "Write a new campaign" : "Write the campaign"}
          </Button>
        </form>
        {err ? <p className="mt-3 text-sm text-loss">{err}</p> : null}

        {/* the Creative Studio skill's flow, step by step */}
        {director ? (
          <div className="mt-4 border-t border-line pt-3">
            <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {director.steps.map((s, i) => {
                const st = run[s.id]?.status ?? (s.auto ? "pending" : "manual");
                return (
                  <li key={s.id} className={clsx("flex items-center gap-1.5", st === "pending" && "text-ink-3", st === "manual" && "text-ink-2")} title={s.detail}>
                    <span
                      className={clsx(
                        "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                        st === "done" ? "bg-money text-white" : st === "error" ? "bg-loss text-white" : st === "running" ? "text-ink" : "bg-canvas text-ink-2",
                      )}
                    >
                      {st === "running" ? <Spinner /> : st === "done" ? "✓" : st === "error" ? "!" : st === "manual" ? "→" : i + 1}
                    </span>
                    <span className={clsx(st === "skipped" && "line-through decoration-ink-3")}>{s.title}</span>
                    {run[s.id]?.note ? <span className="text-xs text-ink-3">({run[s.id]!.note})</span> : null}
                    {st === "manual" ? <span className="text-xs text-ink-3">(your click, below)</span> : null}
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-xs text-ink-3">
              The flow comes from the Creative Studio skill, <code>{director.source}</code>.
              {director.problems.length ? <span className="ml-1 text-warn">{director.problems.join(" · ")}</span> : null}
            </p>
          </div>
        ) : null}
      </Panel>

      {!campaign ? (
        busy || starting ? (
          <Panel className="mt-6 flex items-center gap-3 text-ink-2">
            <Spinner /> Writing your new campaign. The pictures and languages follow.
          </Panel>
        ) : director ? (
          <p className="mt-8 max-w-xl text-ink-2">
            No campaign yet. Ask for one above; GPT reads the numbers from Insights and builds the pack around the users who pay.
          </p>
        ) : null
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
                    onClick={() => {
                      setLang(l.key);
                      if (st === "error") loadLang(l.key); // a language that failed is asked for again
                    }}
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      // active: solid. Already written: a faded version of it. Not written yet: plain.
                      lang === l.key ? "bg-ink text-white" : st === "ready" ? "bg-ink/70 text-white hover:bg-ink/80" : "bg-surface hover:bg-white",
                      l.tier !== 1 && lang !== l.key && st !== "ready" && "text-ink-2",
                    )}
                    title={`${l.name}${st === "ready" ? " · written" : ""}${l.tier === 1 ? "" : " · needs native review"}`}
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
              {L.key === "en" ? (
                <Tag tone="money">Source language</Tag>
              ) : review ? (
                <Tag tone="warn">Machine-written. Have a native speaker check this before publishing.</Tag>
              ) : locs[lang]?.check && !flagged.length ? (
                <Tag tone="money">Machine-written, meaning checked</Tag>
              ) : (
                <Tag>Machine-written</Tag>
              )}
              {market ? (
                <span className="text-ink-3">
                  {L.name} speakers in your data: {market.users.toLocaleString()} users, ${market.revPerUser.toFixed(2)} each
                  {L.tier === "data" ? `, ${market.revenueShare}% of revenue` : ""}
                </span>
              ) : null}
              {L.key.startsWith("sr") ? (
                <button className="text-ink-2 underline" onClick={() => setLang(L.key === "sr-Latn" ? "sr-Cyrl" : "sr-Latn")}>
                  {L.key === "sr-Latn" ? "Show Cyrillic" : "Show Latin"}
                </button>
              ) : null}
              {locs[lang]?.model ? <span className="text-ink-3">Written by {locs[lang]?.model}</span> : null}
              {locs[lang]?.checking ? <span className="text-ink-3">Checking meaning against English…</span> : null}
              {review && locs[lang]?.check && !flagged.length ? <Tag tone="money">Back-translation: meaning matches English</Tag> : null}
              {flagged.length ? <Tag tone="loss">{flagged.length} line{flagged.length > 1 ? "s" : ""} changed meaning</Tag> : null}
            </div>
          </section>

          {locs[lang]?.status === "error" ? (
            <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-loss">
              {locs[lang]?.error}
              <Button kind="quiet" className="px-3 py-1" onClick={() => loadLang(lang)}>Try again</Button>
            </p>
          ) : null}

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
              </div>
            </div>

            {/* Instructions for every banner: words and pictures. Written by the art director step, editable. */}
            <form
              className="mt-4 flex flex-col gap-2 md:flex-row md:items-start"
              onSubmit={(e) => {
                e.preventDefault();
                generateFromInstructions();
              }}
            >
              <label className="sr-only" htmlFor="banner-instructions">Instructions for all banners</label>
              <textarea
                id="banner-instructions"
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    generateFromInstructions();
                  }
                }}
                className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface px-4 py-2.5 text-sm leading-relaxed outline-none focus:border-ink"
                placeholder="Instructions for all banners, e.g. “warm evening light, people in their 30s, shorter headlines”"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-ink-2" title="A quicker image model, for generating live">
                  <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Fast model
                </label>
                <Button type="submit" disabled={busy || applying || visualBusy}>
                  {applying || visualBusy ? <Spinner /> : null}
                  {applying ? (visualBusy ? "Making new pictures…" : "Rewriting the banners…") : visualBusy ? "Generating visuals…" : "Generate visuals"}
                </Button>
              </div>
            </form>
            {instructions.trim() && instructions.trim() !== (cur?.bannerInstructions ?? "").trim() ? (
              <p className="mt-1 text-xs text-ink-3">Changed: Generate visuals will rewrite the banners to follow it and make new pictures.</p>
            ) : null}
            {rewriteNote ? <p className="mt-2 text-sm text-ink-2">{rewriteNote}</p> : null}

            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {campaign.concepts.map((c, i) => {
                const lc = loc?.concepts.find((x) => x.id === c.id) ?? loc?.concepts[i];
                const f = fit[`${lang}:${format}:${c.id}`];
                const ed = edits[c.id];
                const bannerWidth = format === "story" ? 260 : 320;
                return (
                  // as wide as its banner and centred in the column, so the caption and edit box line up under the picture
                  <figure key={c.id} className="mx-auto max-w-full" style={{ width: bannerWidth }}>
                    {lc ? (
                      <div className="relative w-fit">
                        <Scaled width={bannerWidth} format={format}>
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
                      <div className="mx-auto grid aspect-[9/16] w-[260px] max-w-full place-items-center rounded-lg bg-surface text-sm text-ink-3">
                        {locs[lang]?.status === "error" ? "Not written" : <Spinner />}
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
                          disabled={ed?.busy || applying || busy}
                          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-ink disabled:opacity-60"
                          placeholder="Change this banner, e.g. “put it in a café”"
                        />
                        <Button type="submit" kind="quiet" className="px-3 py-1.5" disabled={ed?.busy || applying || busy || !ed?.text?.trim()}>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">TikTok / Reels script</h2>
                  {/* placeholder: the idea is to send this script straight to Grok to generate the video */}
                  <Button kind="quiet" disabled title="Coming soon: send this script straight to Grok to generate the video">Generate video with Grok</Button>
                </div>
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
            {pack.error ? <p className="w-full text-sm text-loss">{pack.error}</p> : null}
            {pack.confirm ? (
              <div className="w-full rounded-lg bg-warn-soft p-4 text-sm">
                <p>
                  A native speaker should read these languages before they go out:{" "}
                  {Object.keys(locs).filter((k) => locs[k].status === "ready" && wantsReview(k)).map((k) => langByKey(k)!.name).join(", ")}.
                  Those rows are marked <code>needs_native_review</code> and listed in NEEDS_REVIEW.txt.
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
