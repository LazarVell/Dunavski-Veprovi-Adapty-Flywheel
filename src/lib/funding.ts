/**
 * Funding model. Pure functions so the page can recompute on every slider move.
 *
 * Real inputs (computed from the Lumen data): unpaid store revenue, cumulative revenue per user by day
 * since install for each channel (refunds removed). Typed-in settings: cost per install, fee, cash on hand.
 */
import funding from "../../data/derived/funding.json";
import curves from "../../data/derived/revenue-curves.json";

export const F = funding;
export const PAID_CHANNELS = ["apple_search_ads", "meta_ads", "google_uac", "tiktok_ads"] as const;
export type Channel = (typeof PAID_CHANNELS)[number];

export type Settings = {
  budget: number;
  cashOnHand: number;
  storeFee: number; // store commission, 0.15 for small-business / subscription year 2+
  advanceRate: number; // Adapty Finance: up to 85% of earned, unpaid revenue
  advanceFee: number; // Adapty Finance publishes a flat 2.5%–3.25% per advance (adapty.io/finance)
  payoutLagDays: number; // average days from purchase to store payout
  repayDay: number; // when the current unpaid balance pays out and repays the advance
  horizonDays: number;
  cpi: Record<Channel, number>;
  mix: Record<Channel, number>; // share of budget per channel (0..1)
};

/** Adapty Finance's published fee range per advance (https://adapty.io/finance/). */
export const ADVANCE_FEE_RANGE = [0.025, 0.0325] as const;

export const DEFAULTS: Settings = {
  budget: 40000,
  cashOnHand: 10000,
  storeFee: 0.15,
  advanceRate: 0.85,
  advanceFee: 0.025,
  payoutLagDays: 45,
  repayDay: 30,
  horizonDays: 110,
  // Illustrative costs per install. The seed data has no ad spend: replace these with your own.
  cpi: { apple_search_ads: 3.5, meta_ads: 4.0, google_uac: 3.0, tiktok_ads: 4.5 },
  mix: { apple_search_ads: 0.6, meta_ads: 0.4, google_uac: 0, tiktok_ads: 0 },
};

export type Mix = Record<Channel, number>;

/** Splits 100 whole points by weight, rounding so they always add up to exactly `total`. */
function allotPoints(channels: readonly Channel[], weights: (c: Channel) => number, total: number) {
  const sum = channels.reduce((a, c) => a + weights(c), 0);
  const exact = channels.map((c) => ({ c, raw: sum > 0 ? (total * weights(c)) / sum : 0 }));
  const out = new Map(exact.map((x) => [x.c, Math.floor(x.raw)]));
  let left = total - [...out.values()].reduce((a, b) => a + b, 0);
  for (const x of [...exact].sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)))) {
    if (left <= 0) break;
    if (weights(x.c) <= 0) continue;
    out.set(x.c, out.get(x.c)! + 1);
    left -= 1;
  }
  return out;
}

/** An even split across these channels, adding up to exactly 100%. */
export function evenMix(channels: readonly Channel[]): Mix {
  const points = allotPoints(channels, () => 1, 100);
  return Object.fromEntries(PAID_CHANNELS.map((c) => [c, (points.get(c) ?? 0) / 100])) as Mix;
}

/**
 * Sets one channel's share and rescales the others, keeping their proportions, so the total stays 100%.
 * `base` is the mix to scale from: pass the mix from the start of a drag and a drag can be undone by dragging back.
 * If the other channels all have nothing to scale, the rest is split evenly across `fallback`.
 */
export function rebalanceMix(base: Mix, channel: Channel, share: number, fallback: readonly Channel[] = PAID_CHANNELS): Mix {
  const set = Math.round(Math.min(1, Math.max(0, share)) * 100);
  const others = PAID_CHANNELS.filter((c) => c !== channel);
  const hasWeight = others.some((c) => base[c] > 0);
  const pool = fallback.filter((c) => c !== channel);
  const weight = (c: Channel) => (hasWeight ? base[c] : (pool.length ? pool : others).includes(c) ? 1 : 0);
  const points = allotPoints(others, weight, 100 - set);
  return Object.fromEntries(PAID_CHANNELS.map((c) => [c, (c === channel ? set : points.get(c)!) / 100])) as Mix;
}

type Pt = { day: number; revPerUser: number };
const C = curves as Record<string, Pt[]>;

/** Cumulative gross revenue per user by day d (flat after the last observed day). */
export function revAt(ch: string, d: number) {
  const pts = C[ch];
  if (!pts?.length || d < 0) return 0;
  return pts[Math.min(Math.floor(d), pts.length - 1)].revPerUser;
}

export function unpaid(s: Settings) {
  const gross = F.unpaidGross.appStore + F.unpaidGross.googlePlay;
  const net = gross * Math.max(0, 1 - s.storeFee);
  const advanceMax = net * s.advanceRate;
  return { gross, net, advanceMax };
}

export function channelEconomics(s: Settings) {
  return PAID_CHANNELS.map((ch) => {
    const cpi = s.cpi[ch];
    const net = (d: number) => revAt(ch, d) * (1 - s.storeFee);
    let payback: number | null = null;
    // No usable cost per install means no return can be calculated, so the channel can't be recommended.
    const priced = cpi > 0;
    if (priced) for (let d = 0; d <= s.horizonDays; d += 1) if (net(d) >= cpi) { payback = d; break; }
    const roas60 = priced ? net(60) / cpi : 0;
    const roasH = priced ? net(s.horizonDays) / cpi : 0;
    const refundRate = (F.refundRateByChannel as Record<string, number>)[ch];
    // Guardrail: an advance is repaid from store payouts, so only fund spend that pays itself back inside the horizon.
    const fund = payback !== null && payback <= 60 && roas60 >= 1;
    return { ch, cpi, payback, roas60, roasH, refundRate, net60: net(60), fund };
  });
}

export function simulate(s: Settings) {
  const u = unpaid(s);
  const mixSum = PAID_CHANNELS.reduce((a, c) => a + s.mix[c], 0) || 1;
  const run = (spend: number) => {
    const installs = Object.fromEntries(PAID_CHANNELS.map((c) => [c, s.cpi[c] > 0 ? (spend * s.mix[c]) / mixSum / s.cpi[c] : 0])) as Record<Channel, number>;
    const payouts = (d: number) =>
      PAID_CHANNELS.reduce((a, c) => a + installs[c] * revAt(c, d - s.payoutLagDays) * (1 - s.storeFee), 0);
    const revenue = (d: number) => PAID_CHANNELS.reduce((a, c) => a + installs[c] * revAt(c, d) * (1 - s.storeFee), 0);
    const users = PAID_CHANNELS.reduce((a, c) => a + installs[c], 0);
    return { installs, payouts, revenue, users, spend };
  };

  const budget = Math.max(0, s.budget);
  const cash = Math.max(0, s.cashOnHand);
  const spendNo = Math.min(budget, cash);
  const advance = Math.min(u.advanceMax, Math.max(0, budget - cash));
  const spendYes = Math.min(budget, cash + advance);
  const fee = advance * s.advanceFee;
  const no = run(spendNo), yes = run(spendYes);

  const series = [];
  for (let d = 0; d <= s.horizonDays; d += 2) {
    const baseline = d >= s.repayDay ? u.net : 0; // today's unpaid balance arrives on the repay day
    series.push({
      day: d,
      without: Math.round(s.cashOnHand - spendNo + no.payouts(d) + baseline),
      with: Math.round(s.cashOnHand + advance - spendYes + yes.payouts(d) + baseline - (d >= s.repayDay ? advance + fee : 0)),
    });
  }
  return {
    unpaid: u, advance, fee, spendNo, spendYes,
    usersNo: no.users, usersYes: yes.users,
    revenueNo: no.revenue(s.horizonDays), revenueYes: yes.revenue(s.horizonDays),
    series,
  };
}
