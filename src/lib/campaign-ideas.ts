/**
 * Campaign prompts suggested on the Insights page, built in code from the same numbers as the cards.
 * Three hold all year (best segment, day-one AI edits, best markets); two follow the calendar: the next
 * occasions worth a campaign, each matched to the onboarding goal and the markets that fit it.
 * Every number in a "why" line comes from insights.json; nothing here is written by a model.
 */
import { I, CHANNEL_LABEL, COUNTRY_NAME } from "./insights";

export type CampaignIdea = {
  id: string;
  /** short label on the card, e.g. "Best segment" or "Seasonal · in 20 days" */
  label: string;
  seasonal: boolean;
  title: string;
  /** what goes into Creative Studio's campaign box */
  prompt: string;
  /** the numbers behind it, one plain sentence */
  why: string;
};

/** What people with each onboarding goal want, in words a campaign brief can use. */
const GOAL_PHRASE: Record<string, string> = {
  product_photos: "edit product photos to sell online",
  family: "take photos of their kids and family",
  travel: "take travel photos",
  selfies: "take selfies and portraits",
  social_content: "make photos for social media",
};

/** The users with each goal, as the subject of a sentence. */
const GOAL_PEOPLE: Record<string, string> = {
  product_photos: "Product-photo users",
  family: "Family-photo users",
  travel: "Travel-photo users",
  selfies: "Selfie users",
  social_content: "Social-content users",
};

const usd = (n: number) => `$${n.toFixed(2)}`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** Country names as they read inside a sentence ("in the Netherlands"). */
const THE = new Set(["US", "GB", "NL"]);
const country = (k: string) => `${THE.has(k) ? "the " : ""}${COUNTRY_NAME[k] ?? k}`;
/** How a revenue per user compares to the app average, in words. */
function vsAverage(rev: number) {
  const avg = I.overall.revPerUser;
  if (Math.abs(rev - avg) / avg < 0.05) return `about the app average of ${usd(avg)}`;
  return `${rev > avg ? "above" : "below"} the app average of ${usd(avg)}`;
}
const goal = (k: string) => I.goals.find((g) => g.key === k)!;
const goalRank = (k: string) => [...I.goals].sort((a, b) => b.revPerUser - a.revPerUser).findIndex((g) => g.key === k) + 1;

/** The best-paying of these countries that have enough users to target (same bar as the Markets card). */
function marketsFor(candidates: string[], n = 4) {
  return I.countries
    .filter((c) => candidates.includes(c.key) && c.users >= 400)
    .sort((a, b) => b.revPerUser - a.revPerUser)
    .slice(0, n);
}

// ---------- calendar ----------

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
/** nth weekday of a month (weekday 0 = Sunday), e.g. Thanksgiving = 4th Thursday of November */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  const first = utc(y, m, 1).getUTCDay();
  return utc(y, m, 1 + ((weekday - first + 7) % 7) + 7 * (n - 1));
}
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function range(a: Date, b: Date) {
  if (a.getTime() === b.getTime()) return fmt(a);
  return a.getUTCMonth() === b.getUTCMonth() ? `${fmt(a)}–${b.getUTCDate()}` : `${fmt(a)} – ${fmt(b)}`;
}

const WEST = ["US", "CA", "GB", "DE", "NL", "SE", "FR", "AU"];

type Occasion = {
  id: string;
  name: string;
  /** when it happens in a given year */
  dates: (y: number) => [Date, Date];
  goal: string;
  /** who the campaign is for, completing "a campaign for …" */
  audience: string;
  /** countries where the occasion is a shopping/photo moment */
  markets: string[];
};

const OCCASIONS: Occasion[] = [
  { id: "new-year", name: "New Year", dates: (y) => [utc(y, 1, 1), utc(y, 1, 31)], goal: "selfies",
    audience: "people starting the year with fresh portraits and profile photos", markets: WEST },
  { id: "valentines", name: "Valentine's Day", dates: (y) => [utc(y, 2, 7), utc(y, 2, 14)], goal: "selfies",
    audience: "couples sharing photos of each other", markets: WEST },
  { id: "mothers-day", name: "Mother's Day", dates: (y) => [addDays(nthWeekday(y, 5, 0, 2), -7), nthWeekday(y, 5, 0, 2)], goal: "family",
    audience: "people making the best photos of their mums and families", markets: ["US", "CA", "AU", "DE", "NL"] },
  { id: "summer-travel", name: "Summer travel", dates: (y) => [utc(y, 6, 15), utc(y, 8, 31)], goal: "travel",
    audience: "people taking holiday and travel photos", markets: ["US", "CA", "GB", "DE", "NL", "SE", "FR"] },
  { id: "back-to-school", name: "Back to school", dates: (y) => [utc(y, 8, 20), utc(y, 9, 10)], goal: "family",
    audience: "parents taking first-day-of-school photos", markets: ["US", "CA", "GB", "DE", "NL", "SE", "FR"] },
  { id: "halloween", name: "Halloween", dates: (y) => [utc(y, 10, 20), utc(y, 10, 31)], goal: "family",
    audience: "parents taking photos of their kids in costume", markets: ["US", "CA", "GB"] },
  { id: "black-friday", name: "Black Friday and Cyber Monday",
    dates: (y) => [addDays(nthWeekday(y, 11, 4, 4), 1), addDays(nthWeekday(y, 11, 4, 4), 4)], goal: "product_photos",
    audience: "people who sell online and need their product photos ready for the sale", markets: WEST },
  { id: "holidays", name: "The holiday season", dates: (y) => [utc(y, 12, 1), utc(y, 12, 31)], goal: "family",
    audience: "parents capturing holiday and family moments", markets: WEST },
];

/** The next occasions that haven't ended, soonest first. */
export function upcomingOccasions(now: Date, n = 2) {
  const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  return [now.getUTCFullYear(), now.getUTCFullYear() + 1]
    .flatMap((y) => OCCASIONS.map((o) => ({ o, at: o.dates(y) })))
    .filter(({ at }) => at[1] >= today)
    .sort((a, b) => a.at[0].getTime() - b.at[0].getTime())
    .slice(0, n)
    .map(({ o, at }) => ({ o, at, inDays: Math.max(0, Math.round((at[0].getTime() - today.getTime()) / 86400000)) }));
}

function seasonalIdea({ o, at, inDays }: ReturnType<typeof upcomingOccasions>[number]): CampaignIdea {
  const g = goal(o.goal);
  const mk = marketsFor(o.markets);
  const when = range(at[0], at[1]);
  const rank = goalRank(o.goal);
  // ads need time to learn before the date: suggest launching two weeks ahead
  const launch = inDays > 14 ? ` Launch by ${fmt(addDays(at[0], -14))}.` : "";
  return {
    id: `season-${o.id}`,
    label: inDays === 0 ? "Seasonal · now" : `Seasonal · in ${inDays} day${inDays === 1 ? "" : "s"}`,
    seasonal: true,
    title: `${o.name} (${when})`,
    prompt: `${o.name} (${when}): a campaign for ${o.audience}, in ${list(mk.map((m) => country(m.key)))}.`,
    why:
      `${GOAL_PEOPLE[o.goal]} pay ${g.paidRate}% and bring ${usd(g.revPerUser)} each` +
      (rank === 1 ? ", the most of any goal" : `, ${vsAverage(g.revPerUser)}`) +
      `. ${mk.map((m) => `${m.key} ${usd(m.revPerUser)}`).join(", ")} per user.${launch}`,
  };
}

export function campaignIdeas(now = new Date()): CampaignIdea[] {
  const [segGoal, segChannel] = I.segments[0].key.split(" × ");
  const seg = I.segments[0];
  const hi = I.aiEditsSplit.find((s) => s.key === "5+ edits")!;
  const lo = I.aiEditsSplit.find((s) => s.key === "under 5 edits")!;
  const top = I.countries.filter((c) => c.users >= 400).sort((a, b) => b.revPerUser - a.revPerUser).slice(0, 4);

  return [
    ...upcomingOccasions(now).map(seasonalIdea),
    {
      id: "best-segment",
      label: "Best segment",
      seasonal: false,
      title: `${GOAL_PEOPLE[segGoal]} from ${CHANNEL_LABEL[segChannel]}`,
      prompt: `Find more people who ${GOAL_PHRASE[segGoal]}. Start with ${CHANNEL_LABEL[segChannel]}.`,
      why: `${seg.paidRate}% pay and bring ${usd(seg.revPerUser)} each, with ${seg.refundRate}% of payers refunding: the best segment in your data.`,
    },
    {
      id: "ai-edits",
      label: "Strongest signal",
      seasonal: false,
      title: "People who love the AI edit on day one",
      prompt: "Reach people who will fall in love with the AI edit on their first day.",
      why: `Users with 5+ AI edits on day one pay ${hi.paidRate}% vs ${lo.paidRate}%, and bring ${hi.revenueShare}% of revenue.`,
    },
    {
      id: "best-markets",
      label: "Best markets",
      seasonal: false,
      title: `Grow in ${list(top.map((m) => m.key))}`,
      prompt: `Grow in ${list(top.map((m) => country(m.key)))}, each in its own language.`,
      why: `${top.map((m) => `${m.key} ${usd(m.revPerUser)}`).join(", ")} per user, against the app average of ${usd(I.overall.revPerUser)}.`,
    },
  ];
}
