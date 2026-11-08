import Link from "next/link";
import { PageHead, Panel, Tag } from "@/components/ui";
import { CARDS, I, COUNTRY_NAME } from "@/lib/insights";
import { ChannelChart, EditsChart, MarketChart } from "@/components/InsightCharts";
import { NarrationProvider, SoWhat } from "@/components/SoWhat";
import { AbCheck } from "@/components/AbCheck";
import { LANGS, marketFor, suggestedDataLangs, notSuggestedDataLangs } from "@/lib/languages";
import { campaignIdeas } from "@/lib/campaign-ideas";

// the seasonal ideas follow today's date, so rebuild the page at most hourly instead of freezing it at build time
export const revalidate = 3600;

const CHART: Record<string, React.ReactNode> = {
  channels: <ChannelChart />,
  "ai-edits": <EditsChart />,
  markets: <MarketChart />,
};

export default function InsightsPage() {
  const langRows = LANGS.filter((l) => l.key !== "sr-Cyrl")
    .flatMap((l) => {
      const m = marketFor(l);
      return m ? [{ l, m }] : [];
    })
    .sort((a, b) => b.m.revPerUser - a.m.revPerUser);
  const avg = I.overall.revPerUser;
  const ideas = campaignIdeas(new Date());

  return (
    <NarrationProvider>
      <PageHead
        stage={1}
        title="Who pays, and why"
        lede={`Lumen's revenue, read from ${I.dataset.usersInWindow.toLocaleString()} users with a full 60 days of history. Revenue is net of refunds. Every number here is computed in code; GPT explains what it means.`}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {CARDS.map((c) => (
          <Panel key={c.id}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-2">{c.title}</h2>
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

      <AbCheck />

      <Panel className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">Which markets to focus on first?</h2>
          <span className="text-sm text-ink-3">Revenue per user by the user&apos;s app language (app average {`$${avg.toFixed(2)}`})</span>
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {langRows.map(({ l, m }) => {
            const tone = m.revPerUser >= 12 ? "money" : m.revPerUser < 2.5 || m.billingIssueRate > 6 ? "loss" : "neutral";
            return (
              <div key={l.key} className="flex items-center justify-between border-b border-line py-2 text-sm">
                <span>{l.name}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">${m.revPerUser.toFixed(2)}</span>
                  <span className="w-20 text-right text-xs text-ink-3">{m.users.toLocaleString()} users</span>
                  <Tag tone={tone}>{tone === "money" ? "write first" : tone === "loss" ? "low value" : "ok"}</Tag>
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

      <Panel className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">Campaign ideas from your data</h2>
          <span className="text-sm text-ink-3">Pick one: Creative Studio opens with it and starts writing the campaign, pictures and languages.</span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => (
            <div key={idea.id} className={`flex flex-col rounded-lg border p-4 ${idea.seasonal ? "border-lumen/30 bg-lumen-soft/40" : "border-line bg-canvas"}`}>
              <div>
                <Tag tone={idea.seasonal ? "lumen" : "neutral"}>{idea.label}</Tag>
              </div>
              <h3 className="mt-2 font-semibold">{idea.title}</h3>
              <p className="mt-2 text-sm leading-relaxed">“{idea.prompt}”</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">{idea.why}</p>
              <Link
                href={`/studio?prompt=${encodeURIComponent(idea.prompt)}&run=1`}
                className="mt-auto self-start pt-3 text-sm font-semibold text-lumen underline-offset-2 hover:underline"
              >
                Run this campaign →
              </Link>
            </div>
          ))}
        </div>
      </Panel>

      {/* not a Panel: its bg-surface would win over bg-ink and hide the white text */}
      <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-ink p-5 text-white">
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
      </section>
    </NarrationProvider>
  );
}
