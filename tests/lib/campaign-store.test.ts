import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache", () => import("../helpers/memory-cache"));

import { campaignPayload, getCurrent, saveAdPaywall, saveLocale, saveVisualKey, setCurrent } from "@/lib/campaign-store";
import type { AdPaywall } from "@/lib/ads";
import { resetMemory } from "../helpers/memory-cache";
import { makeLocalized, makeStored } from "../helpers/fixtures";

beforeEach(() => resetMemory());

describe("saveLocale", () => {
  it("keeps languages saved by parallel requests", () => {
    setCurrent(makeStored());
    saveLocale("campaign-1", "de", { data: makeLocalized("DE"), model: "m" });
    saveLocale("campaign-1", "fr", { data: makeLocalized("FR"), model: "m" });
    expect(Object.keys(getCurrent()!.locales!)).toEqual(["de", "fr"]);
  });

  it("drops a language from a campaign that has been replaced", () => {
    setCurrent(makeStored());
    expect(saveLocale("old-campaign", "de", { data: makeLocalized("DE"), model: "m" })).toBe(false);
    expect(getCurrent()!.locales).toBeUndefined();
  });

  it("does nothing with no campaign", () => {
    expect(saveLocale("x", "de", { data: makeLocalized("DE"), model: "m" })).toBe(false);
  });
});

describe("saveVisualKey", () => {
  it("records pictures without losing the others", () => {
    setCurrent(makeStored());
    saveVisualKey("campaign-1", "a:portrait", "1111");
    saveVisualKey("campaign-1", "a:square", "2222");
    expect(getCurrent()!.visualKeys).toEqual({ "a:portrait": "1111", "a:square": "2222" });
  });

  it("drops a picture from a campaign that has been replaced", () => {
    setCurrent(makeStored());
    expect(saveVisualKey("old-campaign", "a:portrait", "1111")).toBe(false);
  });
});

describe("saveAdPaywall", () => {
  const pw = (conceptId: string) => ({ conceptId, flowId: "f" }) as AdPaywall;

  it("keeps each ad's Adapty state, per app", () => {
    setCurrent(makeStored());
    saveAdPaywall("app1", pw("a"));
    saveAdPaywall("app1", pw("b"));
    saveAdPaywall("app2", pw("c"));
    const all = getCurrent()!.adPaywalls!;
    expect(Object.keys(all.app1)).toEqual(["a", "b"]);
    expect(Object.keys(all.app2)).toEqual(["c"]);
  });
});

describe("campaignPayload", () => {
  it("handles no campaign", async () => {
    await expect(campaignPayload(null)).resolves.toEqual({ current: null, visuals: {} });
  });

  it("doesn't send the page data it doesn't need", async () => {
    const { current } = await campaignPayload(makeStored({ locales: { de: { data: makeLocalized("DE"), model: "m" } } }));
    expect(current!.locales).toBeUndefined();
    expect(current!.bannerHistory).toBeUndefined();
  });

  it("lists the written languages, so a reload can bring them back", async () => {
    const stored = makeStored({ locales: { de: { data: makeLocalized("DE"), model: "m" }, nl: { data: makeLocalized("NL"), model: "m" } } });
    expect((await campaignPayload(stored)).current!.writtenLangs).toEqual(["de", "nl"]);
    expect((await campaignPayload(makeStored())).current!.writtenLangs).toEqual([]);
  });

  it("only offers undo for banners with history", async () => {
    const snap = { concept: makeStored().campaign.concepts[0], visualKeys: {} };
    const { current } = await campaignPayload(makeStored({ bannerHistory: { a: [snap, snap], b: [] } }));
    expect(current!.undoable).toEqual({ a: 2 });
  });

  it("shows no picture until one exists", async () => {
    const { visuals } = await campaignPayload(makeStored());
    expect(Object.keys(visuals)).toHaveLength(9);
    expect(Object.values(visuals).every((v) => v === null)).toBe(true);
  });

  describe("the number check on the brief", () => {
    const withWhy = (why: string[], avoid: string[] = []) => {
      const s = makeStored();
      s.campaign.brief = { ...s.campaign.brief, why, avoid };
      return s;
    };

    it("flags a number that isn't in the data", async () => {
      const { current } = await campaignPayload(withWhy(["Apple Search Ads pays 987.65 per user"]));
      expect(current!.unverified).toEqual(["987.65"]);
    });

    it("also checks the keep-out list", async () => {
      const { current } = await campaignPayload(withWhy([], ["TikTok refunds 777.7%"]));
      expect(current!.unverified).toEqual(["777.7"]);
    });

    it("passes a number that is in the data", async () => {
      const { I } = await import("@/lib/insights");
      const { current } = await campaignPayload(withWhy([`TikTok: ${I.channels[0].revPerUser} per user`]));
      expect(current!.unverified).toEqual([]);
    });

    it("ignores small counts and bucket labels like 5-7", async () => {
      const { current } = await campaignPayload(withWhy(["Users with 5-7 edits in 3 days"]));
      expect(current!.unverified).toEqual([]);
    });
  });
});
