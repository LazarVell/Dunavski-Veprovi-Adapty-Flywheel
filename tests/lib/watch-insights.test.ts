import { describe, expect, it } from "vitest";
import { alertsFor, ctrSeries, REPLAY_WEEKS, W, weekView } from "@/lib/watch";
import { CARDS, factSheet, I } from "@/lib/insights";

const concepts = [{ id: "tired one", name: "Tired One" }, { id: "b", name: "B" }];

describe("weekView", () => {
  it("adds up only the campaign's channels", () => {
    const ch = Object.keys(REPLAY_WEEKS[0].byChannel)[0];
    const one = (REPLAY_WEEKS[0].byChannel as Record<string, { users: number }>)[ch];
    expect(weekView(0, [ch]).camp.users).toBe(one.users);
  });

  it("copes with channels that have no installs", () => {
    const { camp } = weekView(0, ["nope"]);
    expect(camp).toMatchObject({ users: 0, paidRate: 0, refundRate: 0 });
  });
});

describe("ctrSeries", () => {
  it("gives one row per replayed week", () => {
    expect(ctrSeries(["a"]).map((r) => r.week)).toEqual(REPLAY_WEEKS.map((_, i) => `W${i + 1}`));
  });

  it("wears out only the first concept", () => {
    const rows = ctrSeries(["a", "b"]) as unknown as Record<string, number>[];
    expect(rows[3].a).toBeLessThan(rows[0].a);
    expect(rows[3].b).toBeCloseTo(rows[0].b, 1);
  });
});

describe("alertsFor", () => {
  const channels = Object.keys(REPLAY_WEEKS[0].byChannel);

  it("reports on conversion against the app's baseline", () => {
    const a = alertsFor(0, channels, concepts).find((x) => x.id === "conv-0")!;
    expect(a.text).toContain(`${W.baseline.paidRate}%`);
    expect(["good", "warn"]).toContain(a.level);
  });

  it("says nothing about conversion with no installs", () => {
    expect(alertsFor(0, [], concepts).find((x) => x.id === "conv-0")).toBeUndefined();
  });

  it("raises the fatigue alert in week 3, linking back to Studio", () => {
    const a = alertsFor(2, channels, concepts).find((x) => x.id === "fatigue-2")!;
    expect(a.title).toContain("Tired One");
    expect(a.action?.href).toBe("/studio?refresh=tired%20one");
  });

  it("raises it only in week 3", () => {
    for (const i of [0, 1, 3]) expect(alertsFor(i, channels, concepts).some((x) => x.id.startsWith("fatigue"))).toBe(false);
  });

  it("has no fatigue alert without concepts", () => {
    expect(alertsFor(2, channels, []).some((x) => x.id.startsWith("fatigue"))).toBe(false);
  });

  it("only flags refund spikes with enough payers", () => {
    REPLAY_WEEKS.forEach((_, i) => {
      for (const a of alertsFor(i, channels, concepts).filter((x) => x.id.startsWith("refund-"))) {
        const payers = Number(a.text.match(/of (\d+) payers/)?.[1]);
        expect(payers).toBeGreaterThanOrEqual(15);
      }
    });
  });
});

describe("Insights text", () => {
  it("builds every card from real numbers", () => {
    for (const c of CARDS) expect([c.headline, ...c.facts].join(" ")).not.toMatch(/undefined|NaN/);
  });

  it("gives the model every channel and country", () => {
    const sheet = factSheet();
    for (const c of [...I.channels, ...I.countries]) expect(sheet).toContain(`- ${c.key}:`);
    expect(sheet).not.toMatch(/undefined|NaN/);
  });
});
