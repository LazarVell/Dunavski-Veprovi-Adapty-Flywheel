import { describe, expect, it } from "vitest";
import { campaignIdeas, upcomingOccasions } from "@/lib/campaign-ideas";
import { I } from "@/lib/insights";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe("upcomingOccasions", () => {
  it("calculates Black Friday and Cyber Monday from Thanksgiving", () => {
    const [bf] = upcomingOccasions(at("2026-11-07"));
    expect(bf.o.id).toBe("black-friday");
    expect(day(bf.at[0])).toBe("2026-11-27");
    expect(day(bf.at[1])).toBe("2026-11-30");
    expect(bf.inDays).toBe(20);
  });

  it("moves with the calendar from year to year", () => {
    const [bf] = upcomingOccasions(at("2027-11-01"));
    expect(day(bf.at[0])).toBe("2027-11-26");
  });

  it("puts Mother's Day on the second Sunday of May", () => {
    const [md] = upcomingOccasions(at("2027-03-01"));
    expect(md.o.id).toBe("mothers-day");
    expect(day(md.at[1])).toBe("2027-05-09");
  });

  it("treats a running occasion as happening now, through its last day", () => {
    const [first] = upcomingOccasions(at("2026-11-30"));
    expect(first.o.id).toBe("black-friday");
    expect(first.inDays).toBe(0);
  });

  it("drops an occasion the day after it ends", () => {
    expect(upcomingOccasions(at("2026-12-01"))[0].o.id).toBe("holidays");
  });

  it("rolls over into the next year", () => {
    const [now, next] = upcomingOccasions(at("2026-12-28"));
    expect(now.o.id).toBe("holidays");
    expect(next.o.id).toBe("new-year");
    expect(day(next.at[0])).toBe("2027-01-01");
    expect(next.inDays).toBe(4);
  });

  it("returns as many as asked for, soonest first", () => {
    const list = upcomingOccasions(at("2026-03-01"), 4);
    expect(list).toHaveLength(4);
    const starts = list.map((x) => x.at[0].getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("campaignIdeas", () => {
  const ideas = campaignIdeas(at("2026-11-07"));

  it("gives two seasonal ideas and three year-round ones", () => {
    expect(ideas.filter((i) => i.seasonal)).toHaveLength(2);
    expect(ideas.filter((i) => !i.seasonal).map((i) => i.id)).toEqual(["best-segment", "ai-edits", "best-markets"]);
  });

  it("uses the app's real numbers in the why line", () => {
    const seg = ideas.find((i) => i.id === "best-segment")!;
    expect(seg.why).toContain(`${I.segments[0].paidRate}%`);
    expect(seg.why).toContain(`$${I.segments[0].revPerUser.toFixed(2)}`);
  });

  it("writes country names as they read in a sentence", () => {
    const markets = ideas.find((i) => i.id === "best-markets")!;
    expect(markets.prompt).toContain("the Netherlands");
    expect(markets.prompt).toContain("the United States");
    expect(markets.prompt).not.toMatch(/\bthe Germany\b/);
  });

  it("suggests a launch date only when there is time for it", () => {
    expect(ideas[0].why).toContain("Launch by Nov 13");
    const running = campaignIdeas(at("2026-11-28")).find((i) => i.id === "season-black-friday")!;
    expect(running.label).toBe("Seasonal · now");
    expect(running.why).not.toContain("Launch by");
  });

  it("says day, not days, for tomorrow", () => {
    expect(campaignIdeas(at("2026-11-26"))[0].label).toBe("Seasonal · in 1 day");
    expect(campaignIdeas(at("2026-11-25"))[0].label).toBe("Seasonal · in 2 days");
  });

  it("only names markets with enough users", () => {
    const thin = I.countries.filter((c) => c.users < 400).map((c) => c.key);
    for (const idea of ideas) for (const k of thin) expect(idea.why).not.toContain(`${k} $`);
  });

  it.each(Array.from({ length: 12 }, (_, m) => m + 1))("builds clean text in month %i", (month) => {
    const list = campaignIdeas(at(`2027-${String(month).padStart(2, "0")}-15`));
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
    for (const i of list) expect(`${i.title} ${i.prompt} ${i.why}`).not.toMatch(/undefined|NaN|null/);
  });
});
