"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { PageHead, Panel, Button, Tag } from "@/components/ui";
import { REPLAY_WEEKS, alertsFor, weekView, ctrSeries, W, type Alert } from "@/lib/watch";
import { CHANNEL_LABEL } from "@/lib/insights";
import { SIGNAL_ENABLED } from "@/lib/stages";

type Concept = { id: string; name: string };

export default function WatchPage() {
  const [channels, setChannels] = useState<string[]>(["apple_search_ads", "meta_ads"]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [week, setWeek] = useState(-1); // -1 = launched, no data yet
  const [feed, setFeed] = useState<(Alert & { slack?: "sent" | "preview" })[]>([]);

  useEffect(() => {
    fetch("/api/campaign").then((r) => r.json()).then((j) => {
      const c = j.current?.campaign;
      if (!c) return;
      setName(c.name);
      const paid = (c.brief.channels as string[]).filter((x) => x !== "organic");
      if (paid.length) setChannels(paid);
      setConcepts(c.concepts.map((x: Concept) => ({ id: x.id, name: x.name })));
    });
  }, []);

  async function advance() {
    const next = week + 1;
    if (next >= REPLAY_WEEKS.length) return;
    setWeek(next);
    const alerts = alertsFor(next, channels, concepts);
    for (const a of alerts) {
      const r = await fetch("/api/slack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a) }).then((x) => x.json()).catch(() => ({ sent: false }));
      setFeed((f) => [...f, { ...a, slack: r.sent ? "sent" : "preview" }]);
    }
  }

  // the feed fills left to right: keep the newest alert in view
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    feedRef.current?.scrollTo({ left: feedRef.current.scrollWidth, behavior: "smooth" });
  }, [feed.length]);

  const view = week >= 0 ? weekView(week, channels) : null;
  const ctr = useMemo(() => ctrSeries(concepts.map((c) => c.id)).slice(0, Math.max(0, week + 1)), [concepts, week]);
  const colors = ["#6c4cf5", "#0b7a5c", "#b4610b"];

  return (
    <div>
      <PageHead
        stage={4}
        title="Did the campaign's users pay?"
        lede="Flywheel follows the users each campaign brings in: whether they pay, whether they refund, and when an ad wears out. Alerts go to your team's Slack."
        right={name ? <Tag tone="money">Watching: {name}</Tag> : null}
      />

      <Panel className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          <div className="font-semibold">
            {week < 0 ? "Campaign launched. No users have had 14 days yet." : `Week ${week + 1} after launch`}
          </div>
          <div className="mt-0.5 text-ink-3">
            Mocked: time passing. Each step replays a real later Lumen cohort (installs from the week of{" "}
            {REPLAY_WEEKS[Math.max(0, week)].weekOf}) as the campaign&apos;s users, with their 14-day outcomes.
          </div>
        </div>
        <Button onClick={advance} disabled={week >= REPLAY_WEEKS.length - 1}>
          {week < 0 ? "Jump one week ahead" : week >= REPLAY_WEEKS.length - 1 ? "End of replay" : "Next week"}
        </Button>
      </Panel>

      <section className="mt-5 space-y-5">
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Panel>
              <div className="text-sm text-ink-2">Paid within 14 days</div>
              <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{view ? `${view.camp.paidRate.toFixed(1)}%` : "–"}</div>
              <div className="mt-1 text-sm text-ink-3">App average {W.baseline.paidRate}%</div>
            </Panel>
            <Panel>
              <div className="text-sm text-ink-2">Payers who refunded</div>
              <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{view ? `${view.camp.refundRate.toFixed(1)}%` : "–"}</div>
              <div className="mt-1 text-sm text-ink-3">App average {W.baseline.refundRate}% in 14 days</div>
            </Panel>
            <Panel>
              <div className="text-sm text-ink-2">Campaign installs this week</div>
              <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{view ? view.camp.users.toLocaleString() : "–"}</div>
              <div className="mt-1 text-sm text-ink-3">{channels.map((c) => CHANNEL_LABEL[c] ?? c).join(" + ")}</div>
            </Panel>
          </div>

          <Panel>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold">Ad click-through by concept</h2>
              <Tag>Simulated ad data</Tag>
            </div>
            <div className="mt-3 h-56">
              {ctr.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ctr} margin={{ left: 0, right: 12, top: 8 }}>
                    <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#7a8399" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#7a8399" }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={40} domain={[1, 3.2]} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Legend formatter={(v) => concepts.find((c) => c.id === v)?.name ?? v} />
                    {concepts.map((c, i) => (
                      <Line key={c.id} dataKey={c.id} stroke={colors[i % 3]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-sm text-ink-3">No ad data yet. Jump one week ahead.</div>
              )}
            </div>
          </Panel>
        </div>

        <Panel>
          <div className="flex items-center justify-between">
            <div className="font-semibold"># growth-alerts</div>
            <span className="text-xs text-ink-3">Slack</span>
          </div>
          <div ref={feedRef} className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
            {feed.length === 0 ? <p className="text-sm text-ink-3">Alerts appear here and in your Slack channel as the weeks go by.</p> : null}
            {feed.map((a) => (
              <div key={a.id} className={clsx("slack-in flex w-80 max-w-[85%] shrink-0 snap-start flex-col rounded-lg border-l-4 bg-canvas p-3", a.level === "good" ? "border-[#2bb673]" : a.level === "warn" ? "border-[#f2a33a]" : "border-[#7aa7ff]")}>
                <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
                  <span className="font-semibold text-ink">Flywheel</span>
                  <span>week {a.week} · {a.slack === "sent" ? "sent to Slack" : "preview (Slack not connected)"}</span>
                </div>
                <div className="mt-1 text-sm font-semibold">{a.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.text}</p>
                {a.action ? (
                  <div className="mt-auto pt-2">
                    <Link href={a.action.href} className="inline-block rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/90">
                      {a.action.label} →
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {week >= REPLAY_WEEKS.length - 1 ? (
        <Panel className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm text-ink-2">
            What these users did is the next round of insights: which markets refunded, which concept wore out, which channel earned its advance back.
            {SIGNAL_ENABLED ? " First, tell the ad platforms which of them were worth paying for." : ""}
          </p>
          <Link href={SIGNAL_ENABLED ? "/signal" : "/insights"} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
            {SIGNAL_ENABLED ? "Next: Signal" : "Back to Insights"}
          </Link>
        </Panel>
      ) : null}
    </div>
  );
}
