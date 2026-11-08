import { afterEach, describe, expect, it, vi } from "vitest";

const arm = (key: string, paidRate: number, revPerUser: number) => ({ key, users: 1000, paidRate, revPerUser, refundRate: 5 });
const audit = (over: Record<string, unknown>) => ({
  name: "Main: a vs b",
  variants: [arm("a", 20, 10), arm("b", 25, 12)],
  z: 0,
  tRevenue: 0,
  declaredWinner: null,
  horizon: [],
  lifetimeShare: {},
  ...over,
});

/** The verdict logic, run on made-up tests instead of the real data. */
async function verdictFor(over: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("../../data/derived/insights.json", () => ({ default: { abAudit: [audit(over)] } }));
  const { CHECKS } = await import("@/lib/abcheck");
  return CHECKS[0];
}

afterEach(() => {
  vi.doUnmock("../../data/derived/insights.json");
  vi.resetModules();
});

describe("A/B test verdicts", () => {
  it("flags a declared winner that revenue doesn't back", async () => {
    const c = await verdictFor({ declaredWinner: "a", z: 1, tRevenue: 1 });
    expect(c.verdict).toBe("not-backed");
    expect(c.headline).toContain("no proof it makes more money");
  });

  it("flags a declared winner that loses on conversion", async () => {
    expect((await verdictFor({ declaredWinner: "a", z: 3, tRevenue: 3 })).verdict).toBe("not-backed");
  });

  it("accepts a declared winner the data backs on both", async () => {
    expect((await verdictFor({ declaredWinner: "b", z: 3, tRevenue: 3 })).verdict).toBe("clear");
  });

  it("calls a clear result when both metrics agree and the gap is real", async () => {
    const c = await verdictFor({ z: 3, tRevenue: -3 });
    expect(c.verdict).toBe("clear");
    expect(c.headline).toContain("$12.00 vs $10.00");
  });

  it("is not clear when conversion and revenue pick different arms", async () => {
    const c = await verdictFor({ variants: [arm("a", 30, 10), arm("b", 20, 12)], z: 3, tRevenue: 3 });
    expect(c.verdict).toBe("unclear");
  });

  it("is unclear when the gap is within noise", async () => {
    const c = await verdictFor({ z: 1.95, tRevenue: 1.95 });
    expect(c.verdict).toBe("unclear");
    expect(c.convSignificant).toBe(false);
  });

  it("counts exactly 1.96 as significant", async () => {
    expect((await verdictFor({ z: 1.96, tRevenue: 1 })).convSignificant).toBe(true);
  });

  const melting = {
    variants: [arm("a", 20, 15), arm("b", 20, 10)],
    lifetimeShare: { a: 50, b: 0 },
    z: 0,
    tRevenue: 3,
  };

  it("spots a lifetime plan whose lead melts as renewals arrive", async () => {
    const c = await verdictFor({ ...melting, horizon: [{ day: 30, a: 10, b: 5 }, { day: 120, a: 16, b: 15 }] });
    expect(c.verdict).toBe("front-loaded");
    expect(c.headline).toContain("$5.00");
    expect(c.headline).toContain("$1.00");
  });

  it("does not call it front-loaded if the lead holds", async () => {
    const c = await verdictFor({ ...melting, horizon: [{ day: 30, a: 10, b: 5 }, { day: 120, a: 20, b: 15 }] });
    expect(c.verdict).not.toBe("front-loaded");
  });

  it("does not call it front-loaded without a lifetime plan", async () => {
    const c = await verdictFor({ ...melting, lifetimeShare: { a: 10, b: 0 }, horizon: [{ day: 30, a: 10, b: 5 }, { day: 120, a: 16, b: 15 }] });
    expect(c.verdict).not.toBe("front-loaded");
  });

  it("leaves sample-size columns out of the horizon", async () => {
    const c = await verdictFor({ horizon: [{ day: 30, a: 10, b: 5, a_n: 100, b_n: 100 }] });
    expect(Object.keys(c.horizon[0]).sort()).toEqual(["a", "b", "day"]);
  });
});

describe("on the real data", () => {
  it("catches the Settings test's wrong winner", async () => {
    const { CHECKS } = await import("@/lib/abcheck");
    expect(CHECKS.find((c) => c.name.startsWith("Settings"))?.verdict).toBe("not-backed");
  });

  it("gives the model every test, with no broken numbers", async () => {
    const { CHECKS, checkFacts } = await import("@/lib/abcheck");
    const facts = checkFacts();
    for (const c of CHECKS) expect(facts).toContain(c.name);
    expect(facts).not.toMatch(/undefined|NaN/);
  });
});
