/**
 * Insight cards, built in code from data/derived/insights.json.
 * Every number on a card comes from the precompute script; the text model only adds the "so what".
 */
import insights from "../../data/derived/insights.json";

export type Stat = (typeof insights.channels)[number];
export const I = insights;

export const CHANNEL_LABEL: Record<string, string> = {
  apple_search_ads: "Apple Search Ads",
  tiktok_ads: "TikTok Ads",
  meta_ads: "Meta Ads",
  google_uac: "Google App Campaigns",
  organic: "Organic",
};
export const GOAL_LABEL: Record<string, string> = {
  product_photos: "Product photos",
  social_content: "Social content",
  travel: "Travel",
  selfies: "Selfies",
  family: "Family",
};
export const COUNTRY_NAME: Record<string, string> = {
  US: "United States", IN: "India", DE: "Germany", PL: "Poland", BR: "Brazil", RS: "Serbia", GB: "United Kingdom",
  MX: "Mexico", TR: "Türkiye", JP: "Japan", NL: "Netherlands", AU: "Australia", CA: "Canada", SE: "Sweden", FR: "France",
};

const ch = (k: string) => insights.channels.find((c) => c.key === k)!;
const asa = ch("apple_search_ads");
const tiktok = ch("tiktok_ads");
const editsHi = insights.aiEditsSplit.find((s) => s.key === "5+ edits")!;
const editsLo = insights.aiEditsSplit.find((s) => s.key === "under 5 edits")!;
const topMarkets = insights.countries.filter((c) => c.users >= 400).slice(0, 5);
const weakMarkets = [...insights.countries].sort((a, b) => a.revPerUser - b.revPerUser).slice(0, 3);
const bestSegment = insights.segments[0];

export type Card = {
  id: string;
  kind: "money" | "signal" | "markets" | "segment";
  title: string;
  headline: string;
  facts: string[];
};

export const CARDS: Card[] = [
  {
    id: "channels",
    kind: "money",
    title: "Who pays: channels",
    headline: `Apple Search Ads users bring in $${asa.revPerUser.toFixed(2)} each in 60 days. TikTok users bring in $${tiktok.revPerUser.toFixed(2)}.`,
    facts: [
      `Apple Search Ads: ${asa.paidRate}% pay, ${asa.refundRate}% of payers refund`,
      `TikTok Ads: ${tiktok.paidRate}% pay, ${tiktok.refundRate}% of payers refund (${(tiktok.refundRate / insights.overall.refundRate).toFixed(1)}× the app average)`,
      `App average: $${insights.overall.revPerUser.toFixed(2)} per user, ${insights.overall.paidRate}% pay`,
      `Refunds take back ${tiktok.refundDollarShare}% of TikTok's gross revenue: the gap is mostly fewer payers (${tiktok.paidRate}% vs ${asa.paidRate}%)`,
    ],
  },
  {
    id: "ai-edits",
    kind: "signal",
    title: "Strongest predictor",
    headline: `Users who make 5+ AI edits on day one pay at ${editsHi.paidRate}%, twice the rate of everyone else (${editsLo.paidRate}%).`,
    facts: [
      `5+ edits: $${editsHi.revPerUser.toFixed(2)} per user vs $${editsLo.revPerUser.toFixed(2)}`,
      `${editsHi.revenueShare}% of revenue comes from the ${Math.round((100 * editsHi.users) / insights.overall.users)}% of users who hit 5+ edits`,
      `0 edits: only ${insights.aiEdits[0].paidRate}% ever pay`,
    ],
  },
  {
    id: "markets",
    kind: "markets",
    title: "Best-paying markets",
    headline: `${topMarkets.map((m) => m.key).join(", ")} bring in $${Math.min(...topMarkets.map((m) => m.revPerUser)).toFixed(0)}–${Math.max(...topMarkets.map((m) => m.revPerUser)).toFixed(0)} per user.`,
    facts: [
      ...topMarkets.slice(0, 3).map((m) => `${COUNTRY_NAME[m.key] ?? m.key}: $${m.revPerUser.toFixed(2)}/user, ${m.paidRate}% pay`),
      `Weakest: ${weakMarkets.map((m) => `${m.key} $${m.revPerUser.toFixed(2)}`).join(", ")}`,
    ],
  },
  {
    id: "segment",
    kind: "segment",
    title: "Best segment",
    headline: `${GOAL_LABEL[bestSegment.key.split(" × ")[0]]} users from ${CHANNEL_LABEL[bestSegment.key.split(" × ")[1]]}: ${bestSegment.paidRate}% pay, $${bestSegment.revPerUser.toFixed(2)} each.`,
    facts: insights.segments.slice(1, 3).map((s) => `${s.key.replace(/_/g, " ")}: $${s.revPerUser.toFixed(2)}/user, ${s.paidRate}% pay`),
  },
];

/** The fact sheet the text model receives. Plain numbers only, all computed above. */
export function factSheet(): string {
  const fmt = (s: Stat, label = s.key) =>
    `${label}: users ${s.users}, paid ${s.paidRate}%, $${s.revPerUser}/user (60d, refunds removed), refunds ${s.refundRate}% of payers, billing issues ${s.billingIssueRate}%, revenue share ${s.revenueShare}%`;
  return [
    `APP: Lumen, AI photo editor (iOS + Android). Data as of ${insights.asOf.slice(0, 10)}, ${insights.dataset.usersInWindow} users with a full 60-day window.`,
    `OVERALL: ${fmt(insights.overall, "all users")}`,
    `CHANNELS (dataset keys):\n${insights.channels.map((s) => "- " + fmt(s)).join("\n")}`,
    `AI EDITS ON DAY ONE:\n${insights.aiEdits.map((s) => "- " + fmt(s, s.key + " edits")).join("\n")}`,
    `COUNTRIES:\n${insights.countries.map((s) => "- " + fmt(s)).join("\n")}`,
    `ONBOARDING GOAL:\n${insights.goals.map((s) => "- " + fmt(s)).join("\n")}`,
    `TOP SEGMENTS (goal × channel):\n${insights.segments.map((s) => "- " + fmt(s)).join("\n")}`,
    `PAYWALL PLACEMENTS:\n${insights.placements.map((s) => "- " + fmt(s)).join("\n")}`,
  ].join("\n\n");
}
