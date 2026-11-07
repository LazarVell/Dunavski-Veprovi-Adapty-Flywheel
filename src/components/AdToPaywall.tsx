"use client";
import { useState } from "react";
import clsx from "clsx";
import { Panel, Button, Tag, Spinner } from "@/components/ui";
import { Banner, Scaled } from "@/components/Banner";
import { PaywallPreview } from "@/components/PaywallPreview";
import { adName, paywallFlowName, segmentTitle, abTestTitle, type AdPaywall } from "@/lib/ads";
import type { Campaign, Localized } from "@/lib/schemas";
import type { Lang } from "@/lib/languages";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || `${url} failed`), { body: j });
  return j as T;
}

type Step = "paywall" | "segment" | "publish" | "abtest";

/**
 * Each ad gets its own paywall: the ad's picture and words on Lumen's paywall, as a draft flow in Adapty,
 * plus a segment of that ad's installs and a draft A/B test. Every button says what it creates before the click.
 */
export function AdToPaywall({
  campaign, lang, loc, ready, visuals, saved, onSaved, bannerUpdatedAt = {},
}: {
  campaign: Campaign;
  lang: Lang;
  loc: Localized;
  ready: { lang: string; localized: Localized }[];
  visuals: Record<string, string | null>;
  saved: Record<string, AdPaywall>;
  onSaved: (p: AdPaywall) => void;
  /** when each banner was last edited in the Studio */
  bannerUpdatedAt?: Record<string, string>;
}) {
  const [active, setActive] = useState(campaign.concepts[0]?.id);
  const [busy, setBusy] = useState<Step | null>(null);
  const [err, setErr] = useState<Partial<Record<Step, string>>>({});

  const ci = Math.max(0, campaign.concepts.findIndex((c) => c.id === active));
  const concept = campaign.concepts[ci];
  const lc = loc.concepts.find((x) => x.id === concept.id) ?? loc.concepts[ci];
  const visual = visuals[`${concept.id}:portrait`] ?? null;
  const square = visuals[`${concept.id}:square`] ?? visual;
  // what the paywall shows: the server's 2:1 crop of the square photo (the same file Adapty gets)
  const hero = visuals[`${concept.id}:hero`] ?? square;
  const pw = saved[concept.id];
  // The banner was edited after its paywall draft was written: the draft in Adapty still has the old words/picture.
  const stale = !!pw && (bannerUpdatedAt[concept.id] ?? "") > pw.updatedAt;
  const name = adName(campaign.name, concept.id);
  const langs = ready.map((r) => r.lang);
  // published, and nothing written to the flow since (an updated draft needs publishing again)
  const published = !!pw?.publishedAt && (!pw.configAt || pw.publishedAt >= pw.configAt);

  async function run(step: Step) {
    setBusy(step);
    setErr((e) => ({ ...e, [step]: undefined }));
    try {
      const r =
        step === "paywall"
          ? await post<AdPaywall>("/api/paywall", { create: true, conceptId: concept.id, locales: ready, visualUrl: square })
          : await post<AdPaywall>("/api/audience", { conceptId: concept.id, step });
      onSaved(r);
    } catch (e) {
      const body = (e as { body?: AdPaywall }).body;
      if (body?.flowId) onSaved(body);
      setErr((x) => ({ ...x, [step]: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  }

  const steps: { key: Step; title: string; what: React.ReactNode; done: React.ReactNode | null; enabled: boolean; cta: string }[] = [
    {
      key: "paywall",
      title: "Make this ad's paywall in Adapty",
      what: (
        <>
          Uploads the ad&apos;s picture to Adapty and writes a <strong>draft</strong> flow “{paywallFlowName(campaign.name, concept.name)}”:
          Lumen&apos;s paywall with the ad&apos;s picture and headline, in {langs.length} language{langs.length === 1 ? "" : "s"} ({langs.join(", ")}).
        </>
      ),
      done: pw ? (
        <>
          Draft flow “{pw.flowName}”, {pw.locales.length} languages.{" "}
          {stale ? <Tag tone="warn">The banner changed since. Update the draft.</Tag> : null}{" "}
          {pw.validation === "publishable" ? <Tag tone="money">Adapty says: publishable</Tag> : <Tag tone="warn">{pw.validation.slice(0, 120)}</Tag>}
          <span className="mt-1 flex flex-wrap gap-3">
            {pw.renderUrl ? <a className="font-semibold text-lumen underline" href={pw.renderUrl} target="_blank" rel="noreferrer">See it rendered by Adapty</a> : null}
            {pw.builderUrl ? <a className="font-semibold text-lumen underline" href={pw.builderUrl} target="_blank" rel="noreferrer">Open in the Flow Builder</a> : null}
          </span>
        </>
      ) : null,
      enabled: ready.length > 0,
      cta: pw ? "Update the draft" : "Create the draft",
    },
    {
      key: "segment",
      title: "Show it only to this ad's users",
      what: (
        <>
          Creates the segment “{segmentTitle(name)}”: installs whose attribution creative is <code className="text-xs">{name}</code>. Name the
          ad exactly that in Meta or TikTok (the export pack does).
        </>
      ),
      done: pw?.segmentId ? <>Segment “{pw.segmentTitle}” is in Adapty.</> : null,
      enabled: !!pw,
      cta: "Create the segment",
    },
    {
      key: "publish",
      title: "Publish this ad's paywall",
      what: (
        <>
          Adapty only puts published flows into A/B tests. Publishing changes nothing users see: no placement shows this flow, and the
          test below stays a draft until you start it.
        </>
      ),
      done: published ? <>Published in Adapty.</> : null,
      enabled: !!pw,
      cta: pw?.publishedAt && !published ? "Publish the update" : "Publish the flow",
    },
    {
      key: "abtest",
      title: "Test it against the current paywall",
      what: (
        <>
          Creates a <strong>draft</strong> A/B test “{abTestTitle(concept.name)}” on the Main placement for that segment: “Main - 3 plans”
          vs this ad&apos;s paywall, 50/50.
        </>
      ),
      done: pw?.abTestId ? <>Draft test “{pw.abTestTitle}” is waiting in Adapty. Starting it is your call.</> : null,
      enabled: !!pw?.segmentId && published,
      cta: "Create the draft test",
    },
  ];

  return (
    <Panel className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold">Each ad gets its own paywall</h2>
          <p className="mt-1 text-sm text-ink-2">
            Users who tap an ad should land on a paywall that repeats it. Adapty&apos;s own study of 8,000+ apps found intent-matched paywalls
            lift trial-to-paid by 24% (Apple Ads data). Flywheel builds that paywall from the ad and wires it up in Adapty.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Ad">
          {campaign.concepts.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === concept.id}
              onClick={() => setActive(c.id)}
              className={clsx("rounded-full px-3 py-1.5 text-sm", c.id === concept.id ? "bg-ink text-white" : "bg-canvas hover:bg-white")}
            >
              {c.name}
              {saved[c.id] ? <span className="ml-1.5 text-money">●</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[auto_auto_1fr]">
        <figure className="mx-auto">
          {lc ? (
            <Scaled width={240} format="story">
              <Banner format="story" headline={lc.headline} subline={lc.subline} cta={lc.cta} htmlLang={lang.htmlLang} visualUrl={visual} conceptIndex={ci} />
            </Scaled>
          ) : null}
          <figcaption className="mt-2 text-center text-xs text-ink-3">The ad</figcaption>
        </figure>
        <figure className="mx-auto">
          <PaywallPreview pw={{ ...loc.paywall, headline: lc?.headline ?? loc.paywall.headline, subtitle: lc?.subline ?? loc.paywall.subtitle }} htmlLang={lang.htmlLang} heroUrl={hero} />
          <figcaption className="mt-2 text-center text-xs text-ink-3">The paywall it lands on</figcaption>
        </figure>

        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={s.key} className={clsx("rounded-lg border p-4", s.done ? "border-money/40 bg-money-soft/40" : "border-line")}>
              <div className="flex items-start gap-3">
                <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold", s.done ? "bg-money text-white" : "bg-canvas text-ink-2")}>
                  {s.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.what}</p>
                  {s.done ? <div className="mt-2 text-sm">{s.done}</div> : null}
                  {err[s.key] ? <p className="mt-2 text-sm text-loss">{err[s.key]}</p> : null}
                  {s.key === "abtest" && pw?.abTestError && !err.abtest ? <p className="mt-2 text-sm text-loss">Adapty refused the test: {pw.abTestError}</p> : null}
                  <Button kind={s.done ? "quiet" : "money"} className="mt-3" onClick={() => run(s.key)} disabled={!!busy || !s.enabled || (s.key !== "paywall" && !!s.done)}>
                    {busy === s.key ? <Spinner /> : null}
                    {busy === s.key ? "Working in Adapty…" : s.cta}
                  </Button>
                </div>
              </div>
            </li>
          ))}
          <li className="text-xs text-ink-3">Flywheel never starts a test. That stays your call in Adapty.</li>
        </ol>
      </div>
    </Panel>
  );
}
