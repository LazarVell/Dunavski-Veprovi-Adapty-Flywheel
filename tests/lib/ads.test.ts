import { describe, expect, it } from "vitest";
import { abTestTitle, adName, draftOutOfDate, onboardingFlowName, onbTestTitle, paywallFlowName, segmentTitle } from "@/lib/ads";

describe("adName", () => {
  it("makes the name the ad must carry in Meta or TikTok", () => {
    expect(adName("Bright Family Photos US/CA", "holiday-glow")).toBe("flywheel_bright-family-photos-us-ca_holiday-glow");
  });

  it("strips accents and trims separators", () => {
    expect(adName("  Été à Paris!  ", "--A b--")).toBe("flywheel_ete-a-paris_a-b");
  });

  it("caps the campaign part at 40 characters", () => {
    const slug = adName("x".repeat(80), "c").split("_")[1];
    expect(slug).toHaveLength(40);
  });

  it("is stable, because Adapty's segment matches on it", () => {
    expect(adName("Campaign", "one")).toBe(adName("Campaign", "one"));
  });
});

describe("draftOutOfDate", () => {
  const early = "2026-11-07T10:00:00.000Z", late = "2026-11-07T11:00:00.000Z";

  it("is true when the banner changed after the draft was written", () => expect(draftOutOfDate(late, early)).toBe(true));
  it("is false when the draft is newer", () => expect(draftOutOfDate(early, late)).toBe(false));
  it("is false when the banner was never edited", () => expect(draftOutOfDate(undefined, early)).toBe(false));
  it("is false when there is no draft", () => expect(draftOutOfDate(late, undefined)).toBe(false));
});

describe("Adapty names stay within 100 characters", () => {
  const long = "n".repeat(200);
  it.each([
    ["paywallFlowName", paywallFlowName(long, long)],
    ["segmentTitle", segmentTitle(long)],
    ["abTestTitle", abTestTitle(long)],
    ["onboardingFlowName", onboardingFlowName(long, long)],
    ["onbTestTitle", onbTestTitle(long)],
  ])("%s", (_name, value) => expect(value.length).toBeLessThanOrEqual(100));
});
