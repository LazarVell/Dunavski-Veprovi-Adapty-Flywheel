"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHead, Panel, Tag, usd } from "@/components/ui";
import { DEFAULTS, PAID_CHANNELS, channelEconomics, simulate, F, type Settings, type Channel } from "@/lib/funding";
import { CHANNEL_LABEL } from "@/lib/insights";

function Num({ label, value, onChange, step = 1, prefix = "$", suffix = "", hint }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; prefix?: string; suffix?: string; hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="mt-1 flex items-center rounded-lg border border-line bg-canvas px-3 focus-within:border-ink">
        {prefix ? <span className="text-ink-3">{prefix}</span> : null}
        <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-transparent py-2 pl-1 tabular-nums outline-none" />
        {suffix ? <span className="text-ink-3">{suffix}</span> : null}
      </span>
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export default function FundingPage() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [campaignName, setCampaignName] = useState<string | null>(null);

  // Pull the channel mix from the current campaign's brief.
  useEffect(() => {
    fetch("/api/campaign").then((r) => r.json()).then((j) => {
      const chans: string[] = j.current?.campaign?.brief?.channels ?? [];
      const paid = chans.filter((c): c is Channel => (PAID_CHANNELS as readonly string[]).includes(c));
      if (j.current) setCampaignName(j.current.campaign.name);
      if (paid.length) {
        const mix = Object.fromEntries(PAID_CHANNELS.map((c) => [c, paid.includes(c) ? 1 / paid.length : 0])) as Record<Channel, number>;
        setS((x) => ({ ...x, mix }));
      }
    });
  }, []);

  const econ = useMemo(() => channelEconomics(s), [s]);
  const sim = useMemo(() => simulate(s), [s]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const tiktok = econ.find((e) => e.ch === "tiktok_ads")!;
  const extraRevenue = sim.revenueYes - sim.revenueNo;

  return (
    <div>
      <PageHead
        stage={3}
        title="Pay for it with Adapty Finance"
        lede="Lumen has store revenue it has earned but not been paid yet. Adapty Finance can advance most of it today, so the campaign runs at full size now instead of in two months."
        right={campaignName ? <Tag tone="money">Funding: {campaignName}</Tag> : null}
      />

      <section className="grid gap-5 lg:grid-cols-3">
        <Panel>
          <div className="text-sm text-ink-2">Earned, not yet paid out by the stores</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{usd(sim.unpaid.gross)}</div>
          <div className="mt-2 text-sm text-ink-3">
            App Store {usd(F.unpaidGross.appStore)} · Google Play {usd(F.unpaidGross.googlePlay)}, gross. Apple pays {F.payoutRules.appStore}; Google pays on the {F.payoutRules.googlePlay}.
          </div>
        </Panel>
        <Panel>
          <div className="text-sm text-ink-2">Advance available today</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums text-money">{usd(sim.unpaid.advanceMax)}</div>
          <div className="mt-2 text-sm text-ink-3">
            {Math.round(s.advanceRate * 100)}% of {usd(sim.unpaid.net)} after the {Math.round(s.storeFee * 100)}% store fee. Repaid from those payouts.
          </div>
        </Panel>
        <Panel>
          <div className="text-sm text-ink-2">This campaign uses</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{usd(sim.advance)}</div>
          <div className="mt-2 text-sm text-ink-3">Fee {usd(sim.fee)} at {(s.advanceFee * 100).toFixed(1)}%. Buys {Math.round(sim.usersYes - sim.usersNo).toLocaleString()} more installs now.</div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold">Cash over the next {s.horizonDays} days</h2>
            <span className="text-sm text-ink-3">Spend on day 0; revenue arrives as store payouts ~{s.payoutLagDays} days later</span>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sim.series} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e3e7ee" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#7a8399" }} tickFormatter={(d) => `d${d}`} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#7a8399" }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v, n) => [usd(Number(v)), n === "with" ? "With the advance" : "Without"]} labelFormatter={(d) => `Day ${d}`} />
                <Legend formatter={(v) => (v === "with" ? `With the advance: spend ${usd(sim.spendYes)}` : `Cash only: spend ${usd(sim.spendNo)}`)} />
                <ReferenceLine x={s.repayDay} stroke="#b4610b" strokeDasharray="4 4" label={{ value: "advance repaid", fontSize: 11, fill: "#b4610b", position: "insideTopLeft" }} />
                <Area type="monotone" dataKey="without" stroke="#7a8399" fill="#7a8399" fillOpacity={0.08} strokeWidth={2} />
                <Area type="monotone" dataKey="with" stroke="#0b7a5c" fill="#0b7a5c" fillOpacity={0.14} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            With the advance, the campaign brings in <strong>{usd(sim.revenueYes)}</strong> in {s.horizonDays} days after store fees, against{" "}
            {usd(sim.revenueNo)} on cash alone: <strong className="text-money">{usd(extraRevenue)} more</strong> for a {usd(sim.fee)} fee.
          </p>
        </Panel>
        <Panel>
          <h2 className="text-base font-bold">Settings</h2>
          <div className="mt-3 space-y-3">
            <Num label="Campaign budget" value={s.budget} step={1000} onChange={(v) => set("budget", v)} />
            <Num label="Cash on hand for ads" value={s.cashOnHand} step={1000} onChange={(v) => set("cashOnHand", v)} />
            <Num label="Advance fee" prefix="" suffix="%" step={0.1} value={+(s.advanceFee * 100).toFixed(2)} onChange={(v) => set("advanceFee", v / 100)} hint="Adapty doesn't publish its fee; 2.5% is RevenueCat's published rate." />
            <Num label="Store fee" prefix="" suffix="%" value={Math.round(s.storeFee * 100)} onChange={(v) => set("storeFee", v / 100)} />
          </div>
        </Panel>
      </section>

      <Panel className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Which channels to fund</h2>
          <span className="text-sm text-ink-3">Revenue per user from Lumen&apos;s data, refunds removed. Costs per install are typed in: the seed data has no ad spend.</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th className="py-2 font-medium">Channel</th>
                <th className="py-2 font-medium">Cost per install</th>
                <th className="py-2 font-medium">Share of budget</th>
                <th className="py-2 text-right font-medium">Net revenue / user, 60d</th>
                <th className="py-2 text-right font-medium">Return at 60d</th>
                <th className="py-2 text-right font-medium">Pays back on</th>
                <th className="py-2 text-right font-medium">Refunds</th>
                <th className="py-2 pl-4 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {econ.map((e) => (
                <tr key={e.ch} className="border-b border-line last:border-0">
                  <td className="py-2.5 font-medium">{CHANNEL_LABEL[e.ch]}</td>
                  <td className="py-2.5">
                    <input type="number" step={0.1} value={s.cpi[e.ch]} aria-label={`Cost per install, ${CHANNEL_LABEL[e.ch]}`}
                      onChange={(ev) => set("cpi", { ...s.cpi, [e.ch]: Number(ev.target.value) })}
                      className="w-20 rounded-md border border-line bg-canvas px-2 py-1 tabular-nums" />
                  </td>
                  <td className="py-2.5">
                    <input type="range" min={0} max={1} step={0.05} value={s.mix[e.ch]} aria-label={`Budget share, ${CHANNEL_LABEL[e.ch]}`}
                      onChange={(ev) => set("mix", { ...s.mix, [e.ch]: Number(ev.target.value) })} className="w-28 accent-[#0b7a5c]" />
                    <span className="ml-2 tabular-nums text-ink-3">{Math.round((100 * s.mix[e.ch]) / (PAID_CHANNELS.reduce((a, c) => a + s.mix[c], 0) || 1))}%</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{usd(e.net60, 2)}</td>
                  <td className={`py-2.5 text-right tabular-nums ${e.roas60 < 1 ? "text-loss" : ""}`}>{e.roas60.toFixed(2)}×</td>
                  <td className="py-2.5 text-right tabular-nums">{e.payback === null ? <span className="text-loss">not in {s.horizonDays} days</span> : `day ${e.payback}`}</td>
                  <td className={`py-2.5 text-right tabular-nums ${e.refundRate > 10 ? "text-loss" : ""}`}>{e.refundRate}%</td>
                  <td className="py-2.5 pl-4">{e.fund ? <Tag tone="money">Fund it</Tag> : <Tag tone="loss">Don&apos;t fund</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!tiktok.fund ? (
          <p className="mt-4 rounded-lg bg-loss-soft p-3 text-sm text-loss">
            Don&apos;t put the advance into TikTok. At {usd(tiktok.cpi, 2)} per install its users return {tiktok.roas60.toFixed(2)}× in 60 days once{" "}
            {tiktok.refundRate}% of payers refund, so the spend doesn&apos;t come back before the advance is repaid.
          </p>
        ) : null}
      </Panel>

      <Panel className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-ink-2">
          Adapty&apos;s Welmi case study: advances paid for ads, and revenue grew 6× in 4 months.{" "}
          <a className="underline" href="https://adapty.io/case-studies/welmi-app/" target="_blank" rel="noreferrer">Read the case study</a>. Advance terms here
          follow <a className="underline" href="https://adapty.io/finance/" target="_blank" rel="noreferrer">adapty.io/finance</a> (up to 85%); the fee is a setting.
        </p>
        <Link href="/watch" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Watch the campaign&apos;s users</Link>
      </Panel>
    </div>
  );
}
