import { describe, expect, it } from "vitest";
import { channelEconomics, DEFAULTS, F, PAID_CHANNELS, revAt, simulate, unpaid, type Settings } from "@/lib/funding";

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
