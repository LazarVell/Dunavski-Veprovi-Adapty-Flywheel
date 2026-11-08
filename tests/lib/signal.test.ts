import { describe, expect, it } from "vitest";
import { FEATURES, OPTIONS, payloads, S, score, TIER_NAMES, valueLabel, type Features } from "@/lib/signal";

const pick = (over: Partial<Features> = {}): Features => ({
  ...(Object.fromEntries(FEATURES.map((f) => [f, OPTIONS[f][0]])) as Features),
  ...over,
});

describe("score", () => {
  it("multiplies the base by each feature's factor", () => {
    const x = pick();
    const factors = S.factors as Record<string, Record<string, number>>;
    const expected = FEATURES.reduce((p, f) => p * factors[f][x[f]], S.base);
    expect(score(x).value).toBeCloseTo(expected, 1);
  });

  it("treats an unseen value as neutral", () => {
    const known = score(pick()).breakdown.find((b) => b.feature === "country")!;
    expect(known.factor).toBeGreaterThan(0);
    const unseen = score(pick({ country: "ZZ" })).breakdown.find((b) => b.feature === "country")!;
    expect(unseen.factor).toBe(1);
  });

  it("names the tier it lands in", () => {
    const r = score(pick());
    expect(r.tier).toBeGreaterThanOrEqual(0);
    expect(r.tier).toBeLessThanOrEqual(4);
    expect(r.tierName).toBe(TIER_NAMES[r.tier]);
  });

  it("scores more AI edits higher", () => {
    expect(score(pick({ edits: "5-7" })).value).toBeGreaterThan(score(pick({ edits: "0" })).value);
  });
});

describe("OPTIONS", () => {
  it("orders AI edits by amount, not alphabetically", () => {
    const order = ["0", "1-2", "3-4", "5-7", "8-12", "13+"];
    expect(OPTIONS.edits).toEqual(order.filter((k) => OPTIONS.edits.includes(k)));
  });
});

describe("valueLabel", () => {
  it("writes each kind of value for people", () => {
    expect(valueLabel("channel", "tiktok_ads")).toBe("TikTok Ads");
    expect(valueLabel("country", "NL")).toBe("Netherlands");
    expect(valueLabel("edits", "5-7")).toBe("5-7 edits");
    expect(valueLabel("push", "yes")).toBe("opted in");
    expect(valueLabel("push", "no")).toBe("no push");
  });

  it("falls back to the raw value", () => {
    expect(valueLabel("channel", "new_channel")).toBe("new_channel");
  });
});

describe("payloads", () => {
  it("builds one event for each platform with the same value", () => {
    const p = payloads(pick(), 12.5, 1700000000);
    expect(p.Meta.body.data[0].custom_data.value).toBe(12.5);
    expect(p.TikTok.body.data[0].properties.value).toBe(12.5);
    expect(p.Google.body.events[0].params.value).toBe(12.5);
  });

  it("marks the app platform for Meta", () => {
    expect(payloads(pick({ platform: "iOS" }), 1, 1).Meta.body.data[0].app_data.extinfo).toEqual(["i2"]);
    expect(payloads(pick({ platform: "Android" }), 1, 1).Meta.body.data[0].app_data.extinfo).toEqual(["a2"]);
  });

  it("numbers tiers from 1", () => {
    const x = pick();
    expect(payloads(x, 1, 1).Google.body.events[0].params.flywheel_tier).toBe(score(x).tier + 1);
  });
});
