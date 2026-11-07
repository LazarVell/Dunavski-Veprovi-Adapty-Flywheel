import Link from "next/link";
import { PageHead, Panel, Tag } from "@/components/ui";
import { CARDS, I, COUNTRY_NAME } from "@/lib/insights";
import { ChannelChart, EditsChart, MarketChart } from "@/components/InsightCharts";
import { NarrationProvider, SoWhat } from "@/components/SoWhat";
import { LANGS, marketFor, suggestedDataLangs, notSuggestedDataLangs } from "@/lib/languages";

const CHART: Record<string, React.ReactNode> = {
  channels: <ChannelChart />,
  "ai-edits": <EditsChart />,
  markets: <MarketChart />,
};

export default function InsightsPage() {
  const langRows = LANGS.filter((l) => l.key !== "sr-Cyrl")
    .map((l) => ({ l, m: marketFor(l) }))
    .sort((a, b) => (b.m?.revPerUser ?? -1) - (a.m?.revPerUser ?? -1));
  const avg = I.overall.revPerUser;

  return (
    <NarrationProvider>
      <PageHead
        stage={1}
        title="Who pays, and why"
        lede={`Lumen's revenue, read from ${I.dataset.usersInWindow.toLocaleString()} users with a full 60 days of history. Revenue is net of refunds. Every number here is computed in code; GPT explains what it means.`}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {CARDS.map((c) => (
          <Panel key={c.id} className={c.kind === "alert" ? "border-warn/40 bg-warn-soft/40" : undefined}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-2">{c.title}</h2>
              {c.kind === "alert" ? <Tag tone="warn">Check this test</Tag> : null}
            </div>
            <p className="mt-2 font-display text-xl font-bold leading-snug">{c.headline}</p>
            {CHART[c.id] ? <div className="mt-3">{CHART[c.id]}</div> : null}
            <ul className="mt-3 space-y-1 text-sm text-ink-2">
              {c.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <SoWhat id={c.id} />
          </Panel>
        ))}
      </div>

      <Panel className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">Which languages to write in first</h2>
          <span className="text-sm text-ink-3">Revenue per user by the user&apos;s app language (app average {`$${avg.toFixed(2)}`})</span>
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {langRows.map(({ l, m }) => {
            const tone = !m ? "neutral" : m.revPerUser >= 12 ? "money" : m.revPerUser < 2.5 || m.billingIssueRate > 6 ? "loss" : "neutral";
            return (
              <div key={l.key} className="flex items-center justify-between border-b border-line py-2 text-sm">
                <span>
                  {l.name} <span className="text-ink-3">· tier {l.tier}</span>
                </span>
                <span className="flex items-center gap-2">
                  {m ? (
                    <>
                      <span className="tabular-nums">${m.revPerUser.toFixed(2)}</span>
                      <span className="w-20 text-right text-xs text-ink-3">{m.users.toLocaleString()} users</span>
                    </>
                  ) : (
                    <span className="text-xs text-ink-3">no users yet</span>
                  )}
                  <Tag tone={tone}>{!m ? "new market" : tone === "money" ? "write first" : tone === "loss" ? "low value" : "ok"}</Tag>
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-5 rounded-lg bg-canvas p-4 text-sm">
          <div className="font-semibold">Suggested from your data</div>
          {suggestedDataLangs.map(({ lang, s }) => (
            <div key={lang.key} className="mt-1">
              {lang.name}: {s.revenueShare}% of your revenue, {s.users.toLocaleString()} users, ${s.revPerUser.toFixed(2)} per user.{" "}
              <span className="text-ink-3">Added to Creative Studio with a review warning.</span>
            </div>
          ))}
          <details className="mt-2 text-ink-2">
            <summary className="cursor-pointer">Not suggested ({notSuggestedDataLangs.length})</summary>
            {notSuggestedDataLangs.map(({ lang, s }) => (
              <div key={lang.key} className="mt-1">
                {lang.name}: {s.revenueShare}% of revenue, {s.users.toLocaleString()} users, ${s.revPerUser.toFixed(2)} per user. Below the
                rule ({I.langRule.minRevenueShare}% of revenue, or {I.langRule.minUsers}+ users at or above average revenue).
              </div>
            ))}
          </details>
        </div>
      </Panel>

      <Panel className="mt-5 flex flex-wrap items-center justify-between gap-4 bg-ink text-white">
        <div className="max-w-xl">
          <h2 className="text-xl font-bold">Hand-off to Creative Studio</h2>
          <p className="mt-1 text-sm text-white/75">
            Target users like the 5+ edit group, in {I.countries.filter((c) => c.users >= 400).slice(0, 5).map((c) => COUNTRY_NAME[c.key] ?? c.key).join(", ")}.
            Lead with the AI edit. Keep TikTok-style audiences out.
          </p>
        </div>
        <Link href="/studio" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-white/90">
          Make the campaign
        </Link>
      </Panel>
    </NarrationProvider>
  );
}
