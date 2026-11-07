"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { PageHead, Panel, Button, Tag, usd } from "@/components/ui";
import { S, FEATURES, FEATURE_LABEL, OPTIONS, valueLabel, score, payloads, type Features } from "@/lib/signal";
import { CHANNEL_LABEL } from "@/lib/insights";

const tick = { fontSize: 12, fill: "#46506a" };
const Q = S.holdout.quintiles;
const top = Q[4], bottom = Q[0];
const meta = S.byChannel.find((c) => c.ch === "meta_ads")!;

const DEFAULT: Features = { channel: "meta_ads", country: "US", goal: "product_photos", edits: "5-7", platform: "iOS", push: "yes" };
const PRESETS: { name: string; x: Features }[] = [
  { name: "Meta, strong start", x: DEFAULT },
  { name: "Meta, weak start", x: { ...DEFAULT, country: "IN", goal: "selfies", edits: "0", platform: "Android", push: "no" } },
  { name: "Apple Search Ads, NL", x: { ...DEFAULT, channel: "apple_search_ads", country: "NL", edits: "8-12" } },
  { name: "TikTok, 0 edits", x: { ...DEFAULT, channel: "tiktok_ads", country: "BR", goal: "selfies", edits: "0", platform: "Android" } },
];

export default function SignalPage() {
  const [x, setX] = useState<Features>(DEFAULT);
  const [tab, setTab] = useState<"Meta" | "TikTok" | "Google">("Meta");
  const [sent, setSent] = useState<null | "sending" | "sent" | "preview">(null);
  const [now, setNow] = useState(0); // set on the client only, so server and browser render the same payload
  useEffect(() => setNow(Math.floor(Date.now() / 1000)), [x]);
  const s = useMemo(() => score(x), [x]);
  const p = useMemo(() => payloads(x, s.value, now), [x, s.value, now]);

  async function send() {
    setSent("sending");
    const body = {
      level: "good",
      title: `Signal: ${S.split.holdout.toLocaleString()} installs scored and sent`,
      text: `Top fifth: predicted ${usd(top.pred, 2)} each in 60 days. Bottom fifth: ${usd(bottom.pred, 2)}. Value events queued for Meta, TikTok and Google, so their bidding can look for more of the top fifth. (Demo: the ad-platform send is mocked.)`,
    };
    const r = await fetch("/api/slack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((res) => res.json()).catch(() => ({ sent: false }));
    setSent(r.sent ? "sent" : "preview");
  }

  return (
    <div>
      <PageHead
        stage={5}
        title="Teach the ad platforms who pays"
        lede="Today Meta, TikTok and Google only hear “an install happened” or “a trial started”. Flywheel scores every install at 24 hours from what Adapty already knows, and sends back what that user is worth. Their bidding then looks for more of the users who pay."
        right={<Tag tone="money">Same budget, better users</Tag>}
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Panel>
          <div className="text-sm text-ink-2">Top fifth of scored installs</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums text-money">{top.revShare}%</div>
          <div className="mt-1 text-sm text-ink-3">of 60-day revenue, {usd(top.actual, 2)} per user</div>
        </Panel>
        <Panel>
          <div className="text-sm text-ink-2">Bottom fifth</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums text-loss">{bottom.revShare}%</div>
          <div className="mt-1 text-sm text-ink-3">of revenue, {usd(bottom.actual, 2)} per user</div>
        </Panel>
        <Panel>
          <div className="text-sm text-ink-2">Inside Meta Ads alone</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{Math.round(meta.top20Actual / meta.bottom20Actual)}×</div>
          <div className="mt-1 text-sm text-ink-3">
            best fifth {usd(meta.top20Actual, 2)} vs worst {usd(meta.bottom20Actual, 2)} per user. Meta sees them as the same install.
          </div>
        </Panel>
      </div>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold">Does the score hold up?</h2>
            <Tag tone="money">Tested on later users it never saw</Tag>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            Trained on {S.split.train.toLocaleString()} installs ({S.split.trainInstalls.join(" to ")}), checked on the next{" "}
            {S.split.holdout.toLocaleString()} ({S.split.holdoutInstalls.join(" to ")}). Installs sorted into fifths by score; bars show what each fifth
            actually earned in 60 days, net of refunds.
          </p>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={Q.map((q) => ({ name: q.q === 1 ? "Lowest" : q.q === 5 ? "Top" : `${q.q}`, pred: q.pred, actual: q.actual }))} margin={{ left: 0, right: 8, top: 20, bottom: 4 }}>
                <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v, n) => [usd(Number(v), 2), n === "pred" ? "predicted at 24h" : "actual 60-day revenue"]} cursor={{ fill: "#edf0f4" }} />
                <Legend formatter={(v) => (v === "pred" ? "Predicted at 24h" : "Actual, 60 days")} />
                <Bar dataKey="pred" fill="#9aa3b5" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="actual" fill="#0b7a5c" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="actual" position="top" formatter={(v) => `$${Number(v).toFixed(0)}`} style={{ fontSize: 12, fill: "#16213a", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-bold">Inside each channel</h2>
          <p className="mt-1 text-sm text-ink-2">
            The ad platform already knows the channel. What it can&apos;t see is which of its own installs pay. That spread is what the value signal teaches it.
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th className="py-2 font-medium">Channel</th>
                <th className="py-2 text-right font-medium">Worst fifth</th>
                <th className="py-2 text-right font-medium">Best fifth</th>
                <th className="py-2 text-right font-medium">Spread</th>
              </tr>
            </thead>
            <tbody>
              {S.byChannel.map((c) => (
                <tr key={c.ch} className="border-b border-line">
                  <td className="py-2">{CHANNEL_LABEL[c.ch] ?? c.ch}</td>
                  <td className="py-2 text-right tabular-nums text-loss">{usd(c.bottom20Actual, 2)}</td>
                  <td className="py-2 text-right tabular-nums text-money">{usd(c.top20Actual, 2)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{Math.round(c.top20Actual / c.bottom20Actual)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-3">Actual 60-day revenue per user in the test set, by score within the channel.</p>
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <h2 className="text-xl font-bold">Score an install</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((pr) => (
              <button key={pr.name} onClick={() => setX(pr.x)} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-canvas">
                {pr.name}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <label key={f} className="text-sm">
                <span className="block text-ink-3">{FEATURE_LABEL[f]}</span>
                <select
                  value={x[f]}
                  onChange={(e) => setX((v) => ({ ...v, [f]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5"
                >
                  {OPTIONS[f].map((o) => <option key={o} value={o}>{valueLabel(f, o)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5 flex items-end justify-between gap-4 rounded-lg bg-canvas p-4">
            <div>
              <div className="text-sm text-ink-2">Predicted 60-day value</div>
              <div className={clsx("font-display text-4xl font-extrabold tabular-nums", s.tier >= 3 ? "text-money" : s.tier <= 1 ? "text-loss" : "")}>
                {usd(s.value, 2)}
              </div>
            </div>
            <Tag tone={s.tier >= 3 ? "money" : s.tier <= 1 ? "loss" : "neutral"}>{s.tierName}</Tag>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            <li className="flex justify-between text-ink-3"><span>App average</span><span className="tabular-nums">{usd(S.base, 2)}</span></li>
            {s.breakdown.map((b) => (
              <li key={b.feature} className="flex justify-between">
                <span className="text-ink-2">{b.label}</span>
                <span className={clsx("tabular-nums", b.factor >= 1.05 ? "text-money" : b.factor <= 0.95 ? "text-loss" : "text-ink-3")}>×{b.factor.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">What gets sent</h2>
            <Tag tone="warn">Mocked: not sent</Tag>
          </div>
          <div className="mt-3 flex gap-1">
            {(["Meta", "TikTok", "Google"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={clsx("rounded-lg px-3 py-1.5 text-sm", tab === k ? "bg-ink text-white" : "bg-canvas")}>
                {k}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-ink-3">{p[tab].note}</div>
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-ink p-3 text-xs leading-relaxed text-white/90">{JSON.stringify(p[tab].body, null, 2)}</pre>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button kind="money" onClick={send} disabled={sent === "sending"}>Send today&apos;s scores</Button>
            {sent === "sent" ? <span className="text-sm text-money">Summary posted to Slack.</span> : null}
            {sent === "preview" ? <span className="text-sm text-ink-3">Preview only: Slack not connected.</span> : null}
          </div>
        </Panel>
      </section>

      <Panel className="mt-5 text-sm leading-relaxed text-ink-2">
        <div className="font-semibold text-ink">What&apos;s real, and the limits</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Real: the model and its check. It is base revenue × one factor per day-one fact, fitted in code on Lumen&apos;s data. At the level of a single
            user it is noisy (correlation {S.holdout.corr}); sorted into groups, as above, it separates payers well.
          </li>
          <li>Mocked: sending. The payloads follow each platform&apos;s documented shape; the ad APIs need app review, like Studio&apos;s publish.</li>
          <li>
            Meta&apos;s predicted-LTV bidding currently accepts web events only. For app campaigns the score goes out as the value on a 24-hour event, which
            Meta&apos;s value optimisation can use.
          </li>
          <li>
            Adapty documented the same approach for a fitness app on Meta: weighting trial values by expected lifetime value tripled paid subscriptions from
            users 35+ on the same spend (
            <a className="underline" href="https://adapty.io/blog/same-budget-better-users-signal-engineering-on-meta/" target="_blank" rel="noreferrer">
              Adapty blog
            </a>
            ).
          </li>
        </ul>
      </Panel>

      {/* not a Panel: its bg-surface would win over bg-ink and hide the white text */}
      <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-ink p-5 text-white">
        <div className="max-w-xl">
          <h2 className="text-xl font-bold">The loop closes</h2>
          <p className="mt-1 text-sm text-white/75">
            Better users arrive, Adapty sees what they pay, and the next round of insights starts from sharper numbers.
          </p>
        </div>
        <Link href="/insights" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-white/90">
          Back to Insights
        </Link>
      </section>
    </div>
  );
}
