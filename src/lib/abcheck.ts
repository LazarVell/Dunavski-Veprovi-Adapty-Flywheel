/**
 * A/B test check: is each test's result backed by the data on BOTH conversion and revenue,
 * and does the read window favour one arm? Every verdict and number is computed here, in code,
 * from the offline Lumen data (data/derived/insights.json). The text model only adds the "what to do".
 */
import insights from "../../data/derived/insights.json";

const FLOW_LABEL: Record<string, string> = {
  onb_weekly: "Weekly first",
  onb_trial: "Annual trial",
  main: "3 plans",
  main_lifetime: "Lifetime anchor",
  settings: "Settings - Upgrade",
};
export const flowLabel = (k: string) => FLOW_LABEL[k] ?? k;

const SIG = 1.96; // 95%

type Audit = (typeof insights.abAudit)[number];
type HorizonRow = { day: number } & Record<string, number | null>;

export type Verdict = "not-backed" | "front-loaded" | "clear" | "unclear";

export type Check = {
  name: string;
  short: string;
  verdict: Verdict;
  headline: string;
  facts: string[];
  arms: { key: string; label: string; users: number; paidRate: number; revPerUser: number; refundRate: number }[];
  convSignificant: boolean;
  revSignificant: boolean;
  declaredWinner: string | null;
  horizon: { day: number; [arm: string]: number | null }[];
};

const money = (n: number) => `$${n.toFixed(2)}`;

function check(t: Audit): Check {
  const arms = t.variants.map((v) => ({ key: v.key, label: flowLabel(v.key), users: v.users, paidRate: v.paidRate, revPerUser: v.revPerUser, refundRate: v.refundRate }));
  const byConv = [...arms].sort((a, b) => b.paidRate - a.paidRate);
  const byRev = [...arms].sort((a, b) => b.revPerUser - a.revPerUser);
  const convSignificant = Math.abs(t.z) >= SIG;
  const revSignificant = Math.abs(t.tRevenue) >= SIG;
  const declared = t.declaredWinner;
  const horizon = (t.horizon as unknown as HorizonRow[]).map((h) => Object.fromEntries(Object.entries(h).filter(([k]) => !k.endsWith("_n")))) as Check["horizon"];
  const both = horizon.filter((h) => arms.every((a) => typeof h[a.key] === "number"));
  const short = t.name.split(":")[0];
  const base = {
    name: t.name, short, arms, convSignificant, revSignificant, declaredWinner: declared, horizon,
  };
  const convFact = `Paid within 60 days: ${byConv.map((a) => `${a.label} ${a.paidRate}%`).join(" vs ")} (${convSignificant ? "a real gap" : "within noise"}, z = ${t.z})`;
  const revFact = `Revenue per user, 60 days: ${byRev.map((a) => `${a.label} ${money(a.revPerUser)}`).join(" vs ")} (${revSignificant ? "a real gap" : "within noise"}, t = ${t.tRevenue})`;
  const n = `${arms.reduce((s, a) => s + a.users, 0).toLocaleString()} users with 60 days of history`;

  // 1. A winner was declared, but the data doesn't back it on revenue (or it loses on conversion).
  if (declared && (!revSignificant || (convSignificant && byConv[0].key !== declared))) {
    const w = arms.find((a) => a.key === declared)!;
    const other = arms.find((a) => a.key !== declared)!;
    const lateTie = both.find((h) => h.day >= 90);
    return {
      ...base,
      verdict: "not-backed",
      headline: `The ${short} test was called for “${w.label}”. It converts ${w.paidRate}% vs ${other.paidRate}% for “${other.label}”, and there's no proof it makes more money.`,
      facts: [
        convFact,
        revFact,
        ...(lateTie ? [`By day ${lateTie.day}: ${arms.map((a) => `${a.label} ${money(lateTie[a.key] as number)}`).join(" vs ")}`] : []),
        n,
      ],
    };
  }

  // 2. The revenue leader sells a one-time lifetime plan and its lead melts as renewals come in.
  const lead = byRev[0], trail = byRev[1];
  const ls = t.lifetimeShare as unknown as Record<string, number>;
  if (lead && trail && both.length >= 2 && (ls[lead.key] ?? 0) - (ls[trail.key] ?? 0) >= 20) {
    const first = both[0], last = both[both.length - 1];
    const gap0 = (first[lead.key] as number) - (first[trail.key] as number);
    const gap1 = (last[lead.key] as number) - (last[trail.key] as number);
    if (gap0 > 0 && gap1 < gap0 / 2) {
      return {
        ...base,
        verdict: "front-loaded",
        headline: `“${lead.label}” leads by ${money(gap0)} a user at day ${first.day}, but only ${money(gap1)} by day ${last.day}: a lifetime purchase pays once, renewals catch up.`,
        facts: [revFact, `${ls[lead.key]}% of “${lead.label}” revenue is lifetime purchases`, convFact, n],
      };
    }
  }

  // 3. Both metrics agree, and the gap is real.
  if (convSignificant && revSignificant && byConv[0].key === byRev[0].key) {
    const w = byRev[0], l = byRev[1];
    return {
      ...base,
      verdict: "clear",
      headline: `“${w.label}” wins on both conversion and revenue: ${money(w.revPerUser)} vs ${money(l.revPerUser)} per user.`,
      facts: [convFact, revFact, `Refunds: ${w.label} ${w.refundRate}% of payers vs ${l.refundRate}%`, n],
    };
  }

  return { ...base, verdict: "unclear", headline: `The ${short} test has no clear winner yet.`, facts: [convFact, revFact, n] };
}

/** A clear result is already obvious from Adapty's own P2BB column, so the panel leaves this test out. */
const NOT_SHOWN = new Set(["Onboarding: annual trial vs weekly first"]);

export const CHECKS: Check[] = insights.abAudit.filter((t) => !NOT_SHOWN.has(t.name)).map(check);

/** The facts the text model receives. Plain numbers only, all computed above. */
export const checkFacts = () =>
  CHECKS.map((c) => `TEST "${c.name}" — verdict: ${c.verdict}\n${c.headline}\n${c.facts.map((f) => "- " + f).join("\n")}`).join("\n\n");
