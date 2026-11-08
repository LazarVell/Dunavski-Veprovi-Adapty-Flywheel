import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, LlmUnavailable } = vi.hoisted(() => ({ generate: vi.fn(), LlmUnavailable: class extends Error {} }));
vi.mock("@/lib/cache", () => import("../helpers/memory-cache"));
vi.mock("@/lib/llm", () => ({ generate, LlmUnavailable, openai: vi.fn(), withFallback: vi.fn() }));

import { POST } from "@/app/api/localize/route";
import { getCurrent, setCurrent } from "@/lib/campaign-store";
import { srCyrlToLatn } from "@/lib/languages";
import { resetMemory } from "../helpers/memory-cache";
import { call, makeLocalized, makeStored } from "../helpers/fixtures";

type Opts = { kind: string; user: string };
const calls = (kind: string) => generate.mock.calls.filter(([o]) => (o as Opts).kind === kind);
const headlines = (j: Record<string, any>) => j.localized.concepts.map((c: { headline: string }) => c.headline); // eslint-disable-line @typescript-eslint/no-explicit-any

/** A stand-in model: each full language is numbered, so two separate writes can be told apart. */
function fakeModel() {
  let n = 0;
  generate.mockImplementation(async ({ kind, user }: Opts) => {
    if (kind === "localize") return { data: makeLocalized(`нацрт${++n}`), model: "m" };
    if (kind === "localize-banner") {
      const { concepts } = JSON.parse(user.split("ENGLISH MASTER (JSON):\n")[1]);
      return { data: { concepts: concepts.map((c: { id: string }) => ({ id: c.id, headline: `ново ${c.id}`, subline: `ново под ${c.id}`, cta: `ново ${c.id}` })) }, model: "m" };
    }
    if (kind === "backcheck") return { data: { lines: [{ field: "x", backTranslation: "y", meaningChanged: false, note: "" }] }, model: "checker" };
    throw new Error(`unexpected ${kind}`);
  });
}

beforeEach(() => {
  resetMemory();
  generate.mockReset();
  fakeModel();
  setCurrent(makeStored());
});

describe("POST /api/localize", () => {
  it("serves English straight from the campaign, without the model", async () => {
    const { json } = await call(POST, { lang: "en" });
    expect(headlines(json)).toEqual(["Headline a", "Headline b", "Headline c"]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("reflects edited English at once", async () => {
    const s = makeStored();
    s.campaign.concepts[0].headline = "Edited";
    setCurrent(s);
    expect(headlines((await call(POST, { lang: "en" })).json)[0]).toBe("Edited");
  });

  it("writes a language once per campaign", async () => {
    const first = await call(POST, { lang: "de" });
    const again = await call(POST, { lang: "de" });
    expect(calls("localize")).toHaveLength(1);
    expect(again.json.localized).toEqual(first.json.localized);
  });

  it("checks the same text that is on screen", async () => {
    const shown = await call(POST, { lang: "de" });
    const checked = await call(POST, { lang: "de", check: true });
    expect(calls("localize")).toHaveLength(1);
    expect(checked.json.localized).toEqual(shown.json.localized);
    expect(calls("backcheck")[0][0].user).toContain(shown.json.localized.concepts[0].headline);
    expect(checked.json.backCheck.lines).toHaveLength(1);
  });

  it("runs the meaning check only once", async () => {
    await call(POST, { lang: "de", check: true });
    await call(POST, { lang: "de", check: true });
    expect(calls("backcheck")).toHaveLength(1);
  });

  it("returns no check unless asked", async () => {
    expect((await call(POST, { lang: "de" })).json.backCheck).toBeNull();
  });

  it("writes one language once even when asked twice at the same moment", async () => {
    const [a, b] = await Promise.all([call(POST, { lang: "de" }), call(POST, { lang: "de" })]);
    expect(calls("localize")).toHaveLength(1);
    expect(a.json.localized).toEqual(b.json.localized);
  });

  it("keeps every language written in parallel", async () => {
    await Promise.all(["de", "fr", "es"].map((lang) => call(POST, { lang })));
    expect(Object.keys(getCurrent()!.locales!).sort()).toEqual(["de", "es", "fr"]);
  });

  it("writes a new campaign's languages from scratch", async () => {
    const first = await call(POST, { lang: "de" });
    setCurrent(makeStored({ id: "campaign-2" }));
    const second = await call(POST, { lang: "de" });
    expect(calls("localize")).toHaveLength(2);
    expect(second.json.localized).not.toEqual(first.json.localized);
  });

  it("doesn't save a language into a campaign that replaced its own", async () => {
    generate.mockImplementationOnce(async () => {
      setCurrent(makeStored({ id: "campaign-2" }));
      return { data: makeLocalized("old"), model: "m" };
    });
    await call(POST, { lang: "de" });
    expect(getCurrent()!.id).toBe("campaign-2");
    expect(getCurrent()!.locales).toBeUndefined();
  });

  describe("after a banner's words were edited", () => {
    const markStale = (lang: string, ...stale: string[]) => {
      const s = getCurrent()!;
      setCurrent({ ...s, locales: { ...s.locales, [lang]: { ...s.locales![lang], stale, check: undefined } } });
    };

    it("re-writes only that banner", async () => {
      const before = await call(POST, { lang: "de" });
      markStale("de", "b");
      const after = await call(POST, { lang: "de" });
      expect(calls("localize")).toHaveLength(1);
      expect(calls("localize-banner")).toHaveLength(1);
      expect(headlines(after.json)).toEqual([headlines(before.json)[0], "ново b", headlines(before.json)[2]]);
      expect(after.json.localized.adCopy).toEqual(before.json.localized.adCopy);
    });

    it("clears the out-of-date mark, so it isn't re-written again", async () => {
      await call(POST, { lang: "de" });
      markStale("de", "b");
      await call(POST, { lang: "de" });
      await call(POST, { lang: "de" });
      expect(calls("localize-banner")).toHaveLength(1);
      expect(getCurrent()!.locales!.de.stale).toBeUndefined();
    });

    it("redoes the meaning check on the new words", async () => {
      await call(POST, { lang: "de", check: true });
      markStale("de", "b");
      const { json } = await call(POST, { lang: "de", check: true });
      expect(calls("backcheck")).toHaveLength(2);
      expect(calls("backcheck")[1][0].user).toContain("ново b");
      expect(json.backCheck).not.toBeNull();
    });
  });

  describe("Serbian", () => {
    it("converts Latin from Cyrillic, so the scripts always match", async () => {
      const cyr = await call(POST, { lang: "sr-Cyrl" });
      const lat = await call(POST, { lang: "sr-Latn" });
      expect(headlines(lat.json)).toEqual(headlines(cyr.json).map(srCyrlToLatn));
      expect(calls("localize")).toHaveLength(1);
    });

    it("writes once when both scripts are asked for together", async () => {
      const [lat, cyr] = await Promise.all([call(POST, { lang: "sr-Latn" }), call(POST, { lang: "sr-Cyrl" })]);
      expect(calls("localize")).toHaveLength(1);
      expect(headlines(lat.json)).toEqual(headlines(cyr.json).map(srCyrlToLatn));
    });

    it("asks the model for Cyrillic", async () => {
      await call(POST, { lang: "sr-Latn" });
      expect(calls("localize")[0][0].user).toContain("ћирилица");
    });

    it("keeps the scripts matched after a banner edit", async () => {
      await call(POST, { lang: "sr-Latn" });
      const s = getCurrent()!;
      const mark = (k: string) => ({ ...s.locales![k], stale: ["b"] });
      setCurrent({ ...s, locales: { "sr-Cyrl": mark("sr-Cyrl"), "sr-Latn": mark("sr-Latn") } });
      const lat = await call(POST, { lang: "sr-Latn" });
      const cyr = await call(POST, { lang: "sr-Cyrl" });
      expect(headlines(cyr.json)[1]).toBe("ново b");
      expect(headlines(lat.json)).toEqual(headlines(cyr.json).map(srCyrlToLatn));
      expect(calls("localize-banner")).toHaveLength(1);
    });
  });

  describe("what it claims about a language", () => {
    it("never says a person checked it", async () => {
      expect((await call(POST, { lang: "de" })).json.reviewStatus).toBe("machine_written");
    });

    it("says the meaning was checked only once it has been", async () => {
      expect((await call(POST, { lang: "de", check: true })).json.reviewStatus).toBe("machine_written_meaning_checked");
    });

    it("keeps asking for a native read on the other languages", async () => {
      expect((await call(POST, { lang: "fr", check: true })).json.reviewStatus).toBe("needs_native_review");
    });

    it("calls English the source", async () => {
      expect((await call(POST, { lang: "en" })).json.reviewStatus).toBe("source");
    });
  });

  describe("the meaning check for Serbian", () => {
    it("runs once, because both scripts are the same text", async () => {
      await call(POST, { lang: "sr-Cyrl", check: true });
      await call(POST, { lang: "sr-Latn", check: true });
      expect(calls("backcheck")).toHaveLength(1);
    });

    it("gives both scripts the same answer when asked together", async () => {
      const [lat, cyr] = await Promise.all([call(POST, { lang: "sr-Latn", check: true }), call(POST, { lang: "sr-Cyrl", check: true })]);
      expect(calls("backcheck")).toHaveLength(1);
      expect(lat.json.backCheck).toEqual(cyr.json.backCheck);
    });

    it("reads the Cyrillic the model wrote", async () => {
      await call(POST, { lang: "sr-Latn", check: true });
      expect(calls("backcheck")[0][0].user).toContain("Serbian (Cyrillic)");
      expect(calls("backcheck")[0][0].user).toContain("нацрт1");
    });
  });

  it("writes a language once when the very first request also asks for the check", async () => {
    await call(POST, { lang: "de", check: true });
    expect(calls("localize")).toHaveLength(1);
    expect(calls("backcheck")).toHaveLength(1);
  });

  it("needs a campaign", async () => {
    resetMemory();
    expect((await call(POST, { lang: "de" })).status).toBe(400);
  });

  it("rejects an unknown language", async () => {
    expect((await call(POST, { lang: "xx" })).status).toBe(400);
  });

  it("says 503 when no key is set, 500 for anything else", async () => {
    generate.mockRejectedValueOnce(new LlmUnavailable("no key"));
    expect((await call(POST, { lang: "de" })).status).toBe(503);
    generate.mockRejectedValueOnce(new Error("boom"));
    const r = await call(POST, { lang: "fr" });
    expect(r.status).toBe(500);
    expect(r.json.error).toBe("boom");
  });

  it("can retry after a failed write", async () => {
    generate.mockRejectedValueOnce(new Error("boom"));
    expect((await call(POST, { lang: "de" })).status).toBe(500);
    expect((await call(POST, { lang: "de" })).status).toBe(200);
  });
});
