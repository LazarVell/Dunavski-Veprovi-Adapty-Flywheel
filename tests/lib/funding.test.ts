import { describe, expect, it } from "vitest";
import { channelEconomics, DEFAULTS, evenMix, F, PAID_CHANNELS, rebalanceMix, revAt, simulate, unpaid, type Mix, type Settings } from "@/lib/funding";

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...over });
const allCpi = (v: number) => Object.fromEntries(PAID_CHANNELS.map((c) => [c, v])) as Settings["cpi"];

describe("revAt", () => {
  it("is zero before install and for an unknown channel", () => {
    expect(revAt("meta_ads", -1)).toBe(0);
    expect(revAt("nope", 10)).toBe(0);
  });

  it("uses the whole day for a fractional day", () => {
    expect(revAt("meta_ads", 10.9)).toBe(revAt("meta_ads", 10));
  });

  it("stays flat after the last day we observed", () => {
    expect(revAt("meta_ads", 100000)).toBe(revAt("meta_ads", 200000));
  });

  // Not strictly rising: refunds land after the purchase, so the curve can dip by a few cents.
  it.each(PAID_CHANNELS)("is never negative and grows overall for %s", (ch) => {
    for (let d = 0; d <= 120; d += 1) expect(revAt(ch, d)).toBeGreaterThanOrEqual(0);
    expect(revAt(ch, 120)).toBeGreaterThan(revAt(ch, 1));
  });
});

describe("budget shares", () => {
  const mix = (a: number, m: number, g: number, t: number): Mix => ({ apple_search_ads: a, meta_ads: m, google_uac: g, tiktok_ads: t });
  const total = (x: Mix) => Math.round(PAID_CHANNELS.reduce((s, c) => s + x[c] * 100, 0));

  it("splits evenly and adds up to exactly 100%", () => {
    const m = evenMix(["apple_search_ads", "google_uac", "meta_ads"]);
    expect(total(m)).toBe(100);
    expect([m.apple_search_ads, m.google_uac, m.meta_ads].sort()).toEqual([0.33, 0.33, 0.34]);
    expect(m.tiktok_ads).toBe(0);
  });

  it("gives a single channel everything", () => {
    expect(evenMix(["meta_ads"])).toEqual(mix(0, 1, 0, 0));
  });

  it("sets the moved channel to exactly what was asked", () => {
    expect(rebalanceMix(mix(0.34, 0.33, 0.33, 0), "meta_ads", 0.6).meta_ads).toBe(0.6);
  });

  it("can take a channel all the way to 100%, which the old sliders couldn't", () => {
    expect(rebalanceMix(mix(0.34, 0.33, 0.33, 0), "meta_ads", 1)).toEqual(mix(0, 1, 0, 0));
  });

  it("keeps the other channels in proportion", () => {
    expect(rebalanceMix(mix(0.6, 0.2, 0.2, 0), "meta_ads", 0.6)).toEqual(mix(0.3, 0.6, 0.1, 0));
  });

  it("leaves a channel at zero at zero", () => {
    expect(rebalanceMix(mix(0.5, 0.5, 0, 0), "meta_ads", 0.2).tiktok_ads).toBe(0);
  });

  it.each(Array.from({ length: 21 }, (_, i) => i / 20))("always adds up to 100%% at share %f", (share) => {
    for (const ch of PAID_CHANNELS) expect(total(rebalanceMix(mix(0.34, 0.33, 0.33, 0), ch, share))).toBe(100);
  });

  it("restores the mix when dragged back, scaling from the start of the drag", () => {
    const start = mix(0.34, 0.33, 0.33, 0);
    rebalanceMix(start, "meta_ads", 1);
    expect(rebalanceMix(start, "meta_ads", 0.33)).toEqual(start);
  });

  it("when lowering a channel that had everything, shares the rest across the fallback", () => {
    expect(rebalanceMix(mix(0, 1, 0, 0), "meta_ads", 0.6, ["apple_search_ads", "meta_ads", "google_uac"])).toEqual(mix(0.2, 0.6, 0.2, 0));
  });

  it("uses every other channel if there is no fallback left", () => {
    const m = rebalanceMix(mix(0, 1, 0, 0), "meta_ads", 0.7, ["meta_ads"]);
    expect(total(m)).toBe(100);
    expect(m.tiktok_ads).toBeGreaterThan(0);
  });

  it("holds out-of-range shares to 0 and 100%", () => {
    expect(rebalanceMix(mix(0.5, 0.5, 0, 0), "meta_ads", 5).meta_ads).toBe(1);
    expect(rebalanceMix(mix(0.5, 0.5, 0, 0), "meta_ads", -1).meta_ads).toBe(0);
  });
});

describe("unpaid", () => {
  it("takes the store's fee off the gross, and advances a share of the net", () => {
    const u = unpaid(settings({ storeFee: 0.3, advanceRate: 0.5 }));
    const gross = F.unpaidGross.appStore + F.unpaidGross.googlePlay;
    expect(u.gross).toBe(gross);
    expect(u.net).toBeCloseTo(gross * 0.7);
    expect(u.advanceMax).toBeCloseTo(gross * 0.35);
  });
});

describe("channelEconomics", () => {
  it("funds a channel that pays itself back", () => {
    const rows = channelEconomics(settings({ cpi: allCpi(0.01) }));
    for (const r of rows) {
      expect(r.payback).not.toBeNull();
      expect(r.fund).toBe(true);
    }
  });

  it("refuses a channel that never pays itself back", () => {
    for (const r of channelEconomics(settings({ cpi: allCpi(100000) }))) {
      expect(r.payback).toBeNull();
      expect(r.fund).toBe(false);
    }
  });

  it.each([0, -1])("won't recommend a channel with a cost per install of %i", (cpi) => {
    for (const r of channelEconomics(settings({ cpi: allCpi(cpi) }))) {
      expect(r.roas60).toBe(0);
      expect(r.payback).toBeNull();
      expect(r.fund).toBe(false);
    }
  });

  it("calculates ROAS after the store's fee", () => {
    const s = settings({ storeFee: 0.2, cpi: allCpi(2) });
    for (const r of channelEconomics(s)) expect(r.roas60).toBeCloseTo((revAt(r.ch, 60) * 0.8) / 2);
  });
});

describe("simulate", () => {
  it("needs no advance when the cash covers the budget", () => {
    const r = simulate(settings({ budget: 5000, cashOnHand: 10000 }));
    expect(r.advance).toBe(0);
    expect(r.fee).toBe(0);
    expect(r.spendYes).toBe(r.spendNo);
  });

  it("advances only the shortfall", () => {
    const r = simulate(settings({ budget: 12000, cashOnHand: 10000 }));
    expect(r.advance).toBe(2000);
    expect(r.spendYes).toBe(12000);
    expect(r.spendNo).toBe(10000);
  });

  it("never advances more than the limit", () => {
    const s = settings({ budget: 1e9, cashOnHand: 0 });
    const r = simulate(s);
    expect(r.advance).toBeCloseTo(unpaid(s).advanceMax);
    expect(r.spendYes).toBeLessThan(s.budget);
  });

  it("charges the fee on the advance", () => {
    const r = simulate(settings({ budget: 12000, cashOnHand: 10000, advanceFee: 0.03 }));
    expect(r.fee).toBeCloseTo(60);
  });

  it("starts the cash line at what is left after spending", () => {
    const [first] = simulate(settings({ budget: 12000, cashOnHand: 10000 })).series;
    expect(first.day).toBe(0);
    expect(first.without).toBe(0);
    expect(first.with).toBe(0);
  });

  it("repays the advance and fee on the repay day", () => {
    const s = settings({ budget: 12000, cashOnHand: 10000, advanceFee: 0.03, repayDay: 30, mix: { ...DEFAULTS.mix } });
    const r = simulate(s);
    const before = r.series.find((p) => p.day === 28)!;
    const after = r.series.find((p) => p.day === 30)!;
    expect(before.with - before.without).toBe(0);
    expect(after.with - after.without).toBe(-2060);
  });

  it("plots every second day up to the horizon", () => {
    const r = simulate(settings({ horizonDays: 10 }));
    expect(r.series.map((p) => p.day)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("survives a media mix of all zeros", () => {
    const r = simulate(settings({ mix: { apple_search_ads: 0, meta_ads: 0, google_uac: 0, tiktok_ads: 0 } }));
    expect(r.usersNo).toBe(0);
    expect(Number.isFinite(r.revenueYes)).toBe(true);
  });

  it("stays finite with a cost per install of zero", () => {
    const r = simulate(settings({ cpi: allCpi(0) }));
    expect(r.usersYes).toBe(0);
    expect(Number.isFinite(r.revenueYes)).toBe(true);
    for (const p of r.series) expect(Number.isFinite(p.with)).toBe(true);
  });

  it("treats a negative budget or cash as nothing", () => {
    const r = simulate(settings({ budget: -5000, cashOnHand: -100 }));
    expect(r.spendNo).toBe(0);
    expect(r.spendYes).toBe(0);
    expect(r.advance).toBe(0);
  });

  it("never advances a negative amount when the store fee is over 100%", () => {
    const s = settings({ storeFee: 1.5 });
    expect(unpaid(s).net).toBe(0);
    expect(simulate(s).advance).toBe(0);
  });

  it("buys more users with more money", () => {
    const r = simulate(settings({ budget: 40000, cashOnHand: 10000 }));
    expect(r.usersYes).toBeGreaterThan(r.usersNo);
  });
});
