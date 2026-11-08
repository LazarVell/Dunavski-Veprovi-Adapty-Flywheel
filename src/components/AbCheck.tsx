"use client";
import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Panel, Tag } from "@/components/ui";
import { CHECKS, type Check, type Verdict } from "@/lib/abcheck";

type Live = Record<string, { state: string; startedAt: string | null; stoppedAt: string | null; placement: string | null } | null>;

const VERDICT: Record<Verdict, { label: string; tone: "warn" | "money" | "neutral" }> = {
  "not-backed": { label: "Winner not backed by revenue", tone: "warn" },
  "front-loaded": { label: "60 days overstates it", tone: "warn" },
  clear: { label: "Clear winner", tone: "money" },
  unclear: { label: "No clear winner", tone: "neutral" },
};

const tick = { fontSize: 12, fill: "#46506a" };
const COLORS = ["#6c4cf5", "#9aa3b5"];

function HorizonChart({ c }: { c: Check }) {
  const data = c.horizon.filter((h) => c.arms.every((a) => typeof h[a.key] === "number"));
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
        <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} tickFormatter={(d) => `day ${d}`} />
        <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${v}`} />
        <Tooltip formatter={(v, k) => [`$${Number(v).toFixed(2)} per user`, String(k)]} labelFormatter={(d) => `Day ${d} since install`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {c.arms.map((a, i) => (
          <Line key={a.key} type="monotone" dataKey={a.key} name={a.label} stroke={COLORS[i % 2]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Checks every A/B test on conversion AND revenue, and reads its state live from the Adapty account. */
export function AbCheck() {
  const [live, setLive] = useState<Live | null | "off">(null);
  const [actions, setActions] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/abtests").then((r) => r.json()).then((j) => setLive(j.live ?? "off")).catch(() => setLive("off"));
    fetch("/api/abtests", { method: "POST" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setActions(j.actions ?? {})).catch(() => {});
  }, []);

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">A/B test check</h2>
        <span className="text-sm text-ink-3">
          Each test, judged on conversion and revenue, over the full offline history. State read live from Adapty.
        </span>
      </div>
      <div className="mx-auto mt-3 grid max-w-4xl gap-5 lg:grid-cols-2">
        {CHECKS.map((c) => {
          const v = VERDICT[c.verdict];
          const l = live && live !== "off" ? live[c.name] : null;
          return (
            <Panel key={c.name} className={v.tone === "warn" ? "border-warn/40" : undefined}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-2">{c.short}</h3>
                <Tag tone={v.tone}>{v.label}</Tag>
              </div>
              <div className="mt-1 text-xs text-ink-3">
                {live === null ? "Reading Adapty…" : live === "off" ? "Adapty not connected: offline data only" : l ? (
                  <>Live in Adapty: <strong className="text-ink-2">{l.state}</strong>{l.placement ? ` · ${l.placement}` : ""}{l.stoppedAt ? ` · stopped ${l.stoppedAt.slice(0, 10)}` : ""}</>
                ) : "Not in this Adapty account"}
              </div>
              <p className="mt-3 font-display text-lg font-bold leading-snug">{c.headline}</p>
              {c.verdict === "front-loaded" || c.verdict === "not-backed" ? <div className="mt-3"><HorizonChart c={c} /></div> : null}
              <ul className="mt-3 space-y-1 text-sm text-ink-2">
                {c.facts.map((f) => <li key={f}>{f}</li>)}
              </ul>
              {actions[c.name] ? <p className="mt-4 border-l-2 border-money pl-3 text-sm leading-relaxed text-ink-2">{actions[c.name]}</p> : null}
            </Panel>
          );
        })}
      </div>
    </section>
  );
}
