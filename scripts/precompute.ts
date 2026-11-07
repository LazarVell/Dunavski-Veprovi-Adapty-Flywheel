/**
 * Precompute: turns Adapty's offline Lumen dataset into small JSON files the app reads.
 *
 * Every number the app shows on stage comes from here, computed in code.
 * The text model only ever explains numbers it is handed; it never invents them.
 *
 * Input:  adapty-seed-data-hack/data/offline/{users,transactions}.csv.gz  (git-ignored seed kit)
 *         adapty-seed-data-hack/flows/main.json                           (paywall base for drafts)
 * Output: data/derived/*.json  (committed, so the app runs without the seed kit)
 *
 * Run: npm run precompute
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { parse } from "csv-parse/sync";

const ROOT = path.resolve(__dirname, "..");
const SEED = path.join(ROOT, "adapty-seed-data-hack");
const OUT = path.join(ROOT, "data", "derived");
fs.mkdirSync(OUT, { recursive: true });

type UserRow = {
  user_id: string; platform: string; country: string; device: string; os: string; locale: string;
  install_at: string; acquisition_channel: string; onboarding_goal: string; ai_edits_first_day: string;
  photos_imported: string; push_opt_in: string; app_version: string; placement: string; flow: string; ab_test: string;
};
type TxRow = {
  user_id: string; seq: string; purchase_type: string; product: string; purchased_at: string; price_usd: string;
  offer: string; billing_issue_detected_at: string; refunded_at: string; cancellation_reason: string;
};

const readCsv = <T>(name: string): T[] =>
  parse(zlib.gunzipSync(fs.readFileSync(path.join(SEED, "data", "offline", `${name}.csv.gz`))), { columns: true }) as T[];

const users = readCsv<UserRow>("users");
const txs = readCsv<TxRow>("transactions");

const DAY = 86_400_000;
const WINDOW_DAYS = 60;
const asOf = new Date(txs.reduce((m, t) => (t.purchased_at > m ? t.purchased_at : m), ""));
const asOfMs = asOf.getTime();

// ---------- per-user facts ----------
type U = {
  id: string; platform: string; country: string; lang: string; channel: string; goal: string; aiEdits: number;
  push: boolean; os: string; placement: string; flow: string; abTest: string; installMs: number; full: boolean;
  paid: boolean; refunded: boolean; billingIssue: boolean; rev60: number; revAll: number;
  txs: { dayIdx: number; usd: number; refunded: boolean }[];
};

const byUser = new Map<string, U>();
for (const r of users) {
  const installMs = Date.parse(r.install_at);
  byUser.set(r.user_id, {
    id: r.user_id, platform: r.platform, country: r.country, lang: r.locale.split("_")[0], channel: r.acquisition_channel,
    goal: r.onboarding_goal, aiEdits: Number(r.ai_edits_first_day), push: r.push_opt_in === "yes", os: r.os,
    placement: r.placement, flow: r.flow, abTest: r.ab_test, installMs,
    full: installMs <= asOfMs - WINDOW_DAYS * DAY,
    paid: false, refunded: false, billingIssue: false, rev60: 0, revAll: 0, txs: [],
  });
}
for (const t of txs) {
  const u = byUser.get(t.user_id);
  if (!u) continue;
  const usd = Number(t.price_usd);
  const dayIdx = Math.floor((Date.parse(t.purchased_at) - u.installMs) / DAY);
  const refunded = !!t.refunded_at;
  u.txs.push({ dayIdx, usd, refunded });
  if (!refunded) u.revAll += usd;
  if (dayIdx < WINDOW_DAYS) {
    if (usd > 0) u.paid = true;
    if (usd > 0 && refunded) u.refunded = true;
    if (t.billing_issue_detected_at) u.billingIssue = true;
    if (!refunded) u.rev60 += usd;
  }
}
const all = [...byUser.values()];
const cohort = all.filter((u) => u.full); // users with a complete 60-day window

// ---------- helpers ----------
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (n: number, d: number) => (d ? r1((100 * n) / d) : 0);

type Stats = {
  key: string; users: number; payers: number; paidRate: number; revPerUser: number; revenue: number;
  revenueShare: number; refundRate: number; billingIssueRate: number;
};
const totalRev = cohort.reduce((s, u) => s + u.rev60, 0);
const stats = (key: string, us: U[]): Stats => {
  const payers = us.filter((u) => u.paid);
  const revenue = us.reduce((s, u) => s + u.rev60, 0);
  return {
    key, users: us.length, payers: payers.length, paidRate: pct(payers.length, us.length),
    revPerUser: us.length ? r2(revenue / us.length) : 0, revenue: Math.round(revenue),
    revenueShare: pct(revenue, totalRev),
    refundRate: pct(payers.filter((u) => u.refunded).length, payers.length),
    billingIssueRate: pct(payers.filter((u) => u.billingIssue).length, payers.length),
  };
};
const groupStats = (fn: (u: U) => string, us: U[] = cohort) => {
  const g = new Map<string, U[]>();
  for (const u of us) { const k = fn(u); if (!g.has(k)) g.set(k, []); g.get(k)!.push(u); }
  return [...g.entries()].map(([k, v]) => stats(k, v)).sort((a, b) => b.revPerUser - a.revPerUser);
};
const overall = stats("all", cohort);

// ---------- insights ----------
const editBucket = (n: number) =>
  n === 0 ? "0" : n <= 2 ? "1-2" : n <= 4 ? "3-4" : n <= 7 ? "5-7" : n <= 12 ? "8-12" : "13+";
const editOrder = ["0", "1-2", "3-4", "5-7", "8-12", "13+"];
const aiEdits = groupStats((u) => editBucket(u.aiEdits)).sort((a, b) => editOrder.indexOf(a.key) - editOrder.indexOf(b.key));
const aiEditsSplit = [
  stats("under 5 edits", cohort.filter((u) => u.aiEdits < 5)),
  stats("5+ edits", cohort.filter((u) => u.aiEdits >= 5)),
];

const channels = groupStats((u) => u.channel);
const countries = groupStats((u) => u.country);
const languages = groupStats((u) => u.lang);
const goals = groupStats((u) => u.goal);
const placements = groupStats((u) => u.placement);
const segments = groupStats((u) => `${u.goal} × ${u.channel}`).filter((s) => s.users >= 200).slice(0, 8);
const push = groupStats((u) => (u.push ? "push opt-in" : "no push"));

// A/B tests: per-variant stats + two-proportion z-test on paid rate
const abTests = [...new Set(cohort.map((u) => u.abTest).filter(Boolean))].map((name) => {
  const us = cohort.filter((u) => u.abTest === name);
  const variants = groupStats((u) => u.flow, us);
  const [a, b] = [...variants].sort((x, y) => y.paidRate - x.paidRate);
  let z = 0;
  if (a && b) {
    const p1 = a.payers / a.users, p2 = b.payers / b.users;
    const p = (a.payers + b.payers) / (a.users + b.users);
    z = r1((p1 - p2) / Math.sqrt(p * (1 - p) * (1 / a.users + 1 / b.users)));
  }
  return { name, variants, leaderByPaidRate: a?.key ?? null, z };
});
// The seeded account's "Settings" test was completed with `settings` declared the winner.
const DECLARED_WINNERS: Record<string, string> = { "Settings: upgrade vs lifetime anchor": "settings" };
const abAudit = abTests.map((t) => {
  const declared = DECLARED_WINNERS[t.name] ?? null;
  const dataWinner = [...t.variants].sort((x, y) => y.revPerUser - x.revPerUser)[0]?.key ?? null;
  return { ...t, declaredWinner: declared, dataWinnerByRevenue: dataWinner, suspicious: !!declared && declared !== dataWinner && Math.abs(t.z) >= 1.96 };
});

// ---------- language suggestions ----------
const LANG_RULE = { minRevenueShare: 3, minUsers: 300 };
const DEFAULT_LANGS = ["en", "ru", "sr", "de", "es", "pt", "fr", "it", "nl", "sv", "tr"];
const langSuggestions = languages
  .filter((l) => !DEFAULT_LANGS.includes(l.key))
  .map((l) => {
    const byShare = l.revenueShare >= LANG_RULE.minRevenueShare;
    const byUsers = l.users >= LANG_RULE.minUsers && l.revPerUser >= overall.revPerUser;
    return { ...l, suggested: byShare || byUsers, reason: byShare ? "revenue share" : byUsers ? "users at or above average revenue" : null };
  });

// ---------- revenue curve (cumulative revenue per user by day since install, per channel) ----------
const CURVE_DAYS = 110;
const curveFor = (us: U[]) => {
  const out: { day: number; revPerUser: number; n: number }[] = [];
  for (let d = 0; d <= CURVE_DAYS; d += 1) {
    const eligible = us.filter((u) => u.installMs + (d + 1) * DAY <= asOfMs);
    if (eligible.length < 300) break;
    const rev = eligible.reduce((s, u) => s + u.txs.filter((t) => t.dayIdx <= d && !t.refunded).reduce((a, t) => a + t.usd, 0), 0);
    out.push({ day: d, revPerUser: r2(rev / eligible.length), n: eligible.length });
  }
  return out;
};
const revenueCurves: Record<string, { day: number; revPerUser: number; n: number }[]> = { all: curveFor(all) };
for (const c of channels) revenueCurves[c.key] = curveFor(all.filter((u) => u.channel === c.key));

// ---------- funding: unpaid store revenue ----------
// Apple pays ~33 days after its fiscal month closes; Google Play pays on the 15th of the following month.
// We approximate fiscal months with calendar months.
const payoutDate = (purchasedMs: number, platform: string) => {
  const d = new Date(purchasedMs);
  if (platform === "iOS") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) + 33 * DAY;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15);
};
const monthly = new Map<string, { month: string; appStore: number; googlePlay: number }>();
const unpaid = { appStore: 0, googlePlay: 0 };
for (const t of txs) {
  if (t.refunded_at) continue;
  const u = byUser.get(t.user_id);
  if (!u) continue;
  const usd = Number(t.price_usd);
  const ms = Date.parse(t.purchased_at);
  const month = t.purchased_at.slice(0, 7);
  if (!monthly.has(month)) monthly.set(month, { month, appStore: 0, googlePlay: 0 });
  const m = monthly.get(month)!;
  const store = u.platform === "iOS" ? "appStore" : "googlePlay";
  m[store] += usd;
  if (payoutDate(ms, u.platform) > asOfMs) unpaid[store] += usd;
}
const funding = {
  asOf: asOf.toISOString(),
  payoutRules: { appStore: "about 33 days after Apple's fiscal month closes", googlePlay: "15th of the following month" },
  unpaidGross: { appStore: Math.round(unpaid.appStore), googlePlay: Math.round(unpaid.googlePlay) },
  monthlyGross: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ ...m, appStore: Math.round(m.appStore), googlePlay: Math.round(m.googlePlay) })),
  rev60PerUserByChannel: Object.fromEntries(channels.map((c) => [c.key, c.revPerUser])),
  refundRateByChannel: Object.fromEntries(channels.map((c) => [c.key, c.refundRate])),
};

// ---------- watch: weekly install cohorts by channel and country (14-day outcomes) ----------
const WATCH_DAYS = 14;
const weekStart = (ms: number) => { const d = new Date(ms); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow); };
const watchUsers = all.filter((u) => u.installMs + WATCH_DAYS * DAY <= asOfMs);
const outcome14 = (us: U[]) => {
  let payers = 0, refunded = 0, rev = 0;
  for (const u of us) {
    const early = u.txs.filter((t) => t.dayIdx < WATCH_DAYS);
    if (early.some((t) => t.usd > 0)) payers += 1;
    if (early.some((t) => t.usd > 0 && t.refunded)) refunded += 1;
    rev += early.filter((t) => !t.refunded).reduce((a, t) => a + t.usd, 0);
  }
  return { users: us.length, payers, paidRate: pct(payers, us.length), refundRate: pct(refunded, payers), revPerUser: us.length ? r2(rev / us.length) : 0 };
};
const weeks = [...new Set(watchUsers.map((u) => weekStart(u.installMs)))].sort();
const watch = {
  windowDays: WATCH_DAYS,
  weeks: weeks.map((w) => {
    const us = watchUsers.filter((u) => weekStart(u.installMs) === w);
    const byCountry = Object.fromEntries([...new Set(us.map((u) => u.country))].map((c) => [c, outcome14(us.filter((u) => u.country === c))]));
    const byChannel = Object.fromEntries([...new Set(us.map((u) => u.channel))].map((c) => [c, outcome14(us.filter((u) => u.channel === c))]));
    return { weekOf: new Date(w).toISOString().slice(0, 10), ...outcome14(us), byCountry, byChannel };
  }),
  baselineByCountry: Object.fromEntries([...new Set(watchUsers.map((u) => u.country))].map((c) => [c, outcome14(watchUsers.filter((u) => u.country === c))])),
  baseline: outcome14(watchUsers),
};

// ---------- write ----------
const insights = {
  asOf: asOf.toISOString(), windowDays: WINDOW_DAYS,
  dataset: { usersTotal: all.length, usersInWindow: cohort.length, transactions: txs.length },
  overall, channels, countries, languages, goals, placements, segments, push, aiEdits, aiEditsSplit, abAudit,
  langRule: LANG_RULE, langSuggestions,
};
const write = (name: string, obj: unknown) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1));
write("insights.json", insights);
write("revenue-curves.json", revenueCurves);
write("funding.json", funding);
write("watch.json", watch);

// Paywall base for the matching-paywall draft: the seeded "main" flow (organizers' material, disclosed in README).
const flowSrc = path.join(SEED, "flows", "main.json");
if (fs.existsSync(flowSrc)) fs.copyFileSync(flowSrc, path.join(OUT, "paywall-base.flow.json"));

// ---------- console summary for a quick sanity check ----------
const line = (s: Stats) => `${s.key.padEnd(28)} users ${String(s.users).padStart(6)}  paid ${String(s.paidRate).padStart(5)}%  $/user ${String(s.revPerUser).padStart(6)}  refunds ${String(s.refundRate).padStart(5)}%  rev share ${s.revenueShare}%`;
console.log(`as of ${asOf.toISOString()} | ${cohort.length} users with a full ${WINDOW_DAYS}-day window | overall $${overall.revPerUser}/user, ${overall.paidRate}% paid`);
console.log("\nCHANNELS"); channels.forEach((s) => console.log(line(s)));
console.log("\nAI EDITS (first day)"); [...aiEdits, ...aiEditsSplit].forEach((s) => console.log(line(s)));
console.log("\nCOUNTRIES (top 6, bottom 3)"); [...countries.slice(0, 6), ...countries.slice(-3)].forEach((s) => console.log(line(s) + `  billing ${s.billingIssueRate}%`));
console.log("\nSEGMENTS"); segments.slice(0, 3).forEach((s) => console.log(line(s)));
console.log("\nA/B AUDIT"); abAudit.forEach((t) => console.log(`${t.name}: declared ${t.declaredWinner} | data ${t.dataWinnerByRevenue} | z ${t.z} | suspicious ${t.suspicious}\n  ${t.variants.map((v) => `${v.key} ${v.paidRate}% $${v.revPerUser}`).join("  vs  ")}`));
console.log("\nLANG SUGGESTIONS"); langSuggestions.forEach((l) => console.log(`${l.key}: ${l.revenueShare}% rev, ${l.users} users, $${l.revPerUser} -> ${l.suggested ? "SUGGEST" : "no"}`));
console.log("\nFUNDING unpaid gross", funding.unpaidGross, "\nmonthly", funding.monthlyGross);
console.log("\nCURVE all d30/d60/d90", [30, 60, 90].map((d) => revenueCurves.all[d]?.revPerUser));
console.log("WATCH weeks", watch.weeks.length, "baseline", watch.baseline);
